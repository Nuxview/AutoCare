alter table public.franchises
  add column paystack_subaccount_code text unique;

alter table public.payments
  drop constraint payments_provider_check,
  add constraint payments_provider_check check (provider in ('MPESA','PAYSTACK','CASH','CARD','BANK_TRANSFER')),
  add column checkout_url text;

create unique index payments_one_open_paystack_invoice
  on public.payments(invoice_id)
  where provider = 'PAYSTACK' and status in ('PENDING', 'PROCESSING');

alter table public.subscriptions
  add column paystack_checkout_reference text unique,
  add column paystack_checkout_url text,
  add column paystack_customer_code text,
  add column paystack_subscription_code text unique,
  add column paystack_status text,
  add column paystack_plan_code text;

create or replace function public.settle_paystack_invoice_payment(
  p_reference text, p_amount_minor bigint, p_currency text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_new_amount numeric(12,2);
begin
  select * into v_payment from public.payments
    where reference = p_reference and provider = 'PAYSTACK' for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status = 'SUCCEEDED' then return false; end if;
  if v_payment.status not in ('PENDING', 'PROCESSING') then raise exception 'PAYMENT_NOT_PAYABLE'; end if;
  if v_payment.currency <> upper(p_currency) or v_payment.amount * 100 <> p_amount_minor then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  select * into v_invoice from public.invoices where id = v_payment.invoice_id for update;
  if not found or v_invoice.status not in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') then
    raise exception 'INVOICE_NOT_PAYABLE';
  end if;
  v_new_amount := v_invoice.amount_paid + v_payment.amount;
  if v_new_amount > v_invoice.total_amount then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;

  update public.payments set status = 'SUCCEEDED', paid_at = now()
    where id = v_payment.id;
  update public.invoices set amount_paid = v_new_amount,
    status = case when v_new_amount >= v_invoice.total_amount then 'PAID' else 'PARTIALLY_PAID' end
    where id = v_invoice.id;
  insert into public.notifications(user_id, title, body, type, data)
    values(v_payment.customer_id, 'Payment received',
      v_payment.amount::text || ' ' || v_payment.currency || ' was received for ' || v_invoice.number || '.',
      'PAYMENT_SUCCEEDED', jsonb_build_object('paymentId', v_payment.id));
  return true;
end $$;

revoke all on function public.settle_paystack_invoice_payment(text,bigint,text) from public, anon, authenticated;
grant execute on function public.settle_paystack_invoice_payment(text,bigint,text) to service_role;
