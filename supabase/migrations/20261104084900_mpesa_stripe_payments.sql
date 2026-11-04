alter table public.payments
  drop constraint payments_provider_check,
  add constraint payments_provider_check check (provider in ('MPESA','STRIPE','PAYSTACK','CASH','CARD','BANK_TRANSFER')),
  add column is_test boolean not null default false,
  add column mpesa_checkout_id text unique;

-- Cross-provider reservation guard also covers the existing Paystack insertion path.
create unique index payments_one_open_online_invoice on public.payments(invoice_id)
  where provider in ('MPESA','STRIPE','PAYSTACK') and status in ('PENDING','PROCESSING');

create function public.reserve_sandbox_payment(p_invoice_id uuid, p_customer_id uuid, p_provider text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare i public.invoices%rowtype; p public.payments%rowtype; amount numeric;
begin
  if p_provider not in ('MPESA','STRIPE') then raise exception 'INVALID_PROVIDER'; end if;
  select * into i from public.invoices where id=p_invoice_id and customer_id=p_customer_id for update;
  if not found or i.status not in ('ISSUED','PARTIALLY_PAID','OVERDUE') then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  amount := i.total_amount-i.amount_paid;
  if i.currency <> 'KES' or amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_provider='MPESA' and trunc(amount) <> amount then raise exception 'WHOLE_KES_REQUIRED'; end if;
  select * into p from public.payments where invoice_id=i.id and provider in ('MPESA','STRIPE','PAYSTACK') and status in ('PENDING','PROCESSING');
  if found then
    if p.provider <> p_provider or not p.is_test then raise exception 'CHECKOUT_OPEN'; end if;
    return to_jsonb(p);
  end if;
  insert into public.payments(reference,franchise_id,shop_id,customer_id,invoice_id,provider,amount,currency,is_test)
    values('PAY-'||replace(gen_random_uuid()::text,'-',''),i.franchise_id,i.shop_id,i.customer_id,i.id,p_provider,amount,i.currency,true) returning * into p;
  return to_jsonb(p);
end $$;

create function public.settle_verified_invoice_payment(p_reference text,p_provider text,p_provider_reference text,p_amount_minor bigint,p_currency text,p_is_test boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare p public.payments%rowtype; i public.invoices%rowtype; amount numeric;
begin
  select * into p from public.payments where reference=p_reference and provider=p_provider for update;
  if not found or p_provider not in ('MPESA','STRIPE') then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.provider_reference is distinct from p_provider_reference or p_provider_reference is null
    or p.amount*100 is distinct from p_amount_minor or p.currency is distinct from upper(p_currency)
    or p.is_test is distinct from p_is_test then raise exception 'PAYMENT_MISMATCH'; end if;
  if p.status='SUCCEEDED' then return false; end if;
  if p.status not in ('PENDING','PROCESSING') then raise exception 'PAYMENT_NOT_PAYABLE'; end if;
  select * into i from public.invoices where id=p.invoice_id for update;
  if not found or i.status not in ('ISSUED','PARTIALLY_PAID','OVERDUE') then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  amount := i.amount_paid+p.amount;
  if amount > i.total_amount then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
  update public.payments set status='SUCCEEDED',paid_at=now(),failure_reason=null where id=p.id;
  update public.invoices set amount_paid=amount,status=case when amount=i.total_amount then 'PAID' else 'PARTIALLY_PAID' end where id=i.id;
  insert into public.notifications(user_id,title,body,type,data) values(p.customer_id,
    case when p.is_test then 'Sandbox payment confirmed' else 'Payment received' end,
    p.amount::text||' '||p.currency||' for '||i.number,'PAYMENT_SUCCEEDED',jsonb_build_object('paymentId',p.id,'test',p.is_test));
  return true;
end $$;

revoke all on function public.reserve_sandbox_payment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_sandbox_payment(uuid,uuid,text) to service_role;
revoke all on function public.settle_verified_invoice_payment(text,text,text,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.settle_verified_invoice_payment(text,text,text,bigint,text,boolean) to service_role;
