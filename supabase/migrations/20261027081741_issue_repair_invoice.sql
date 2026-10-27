create or replace function public.issue_repair_invoice(p_job_id uuid,p_actor_id uuid,p_number text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_job jobs%rowtype; v_invoice_id uuid;
begin
  select * into v_job from jobs where id=p_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if not exists(select 1 from memberships where user_id=p_actor_id and franchise_id=v_job.franchise_id and is_active and (shop_id is null or shop_id=v_job.shop_id) and role in ('FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR','ACCOUNTANT')) then raise exception 'FORBIDDEN'; end if;
  select id into v_invoice_id from invoices where job_id=p_job_id;
  if found then return v_invoice_id; end if;
  if v_job.estimate_amount is null or v_job.estimate_amount <= 0 then raise exception 'ESTIMATE_REQUIRED'; end if;
  insert into invoices(number,franchise_id,shop_id,customer_id,job_id,status,subtotal,tax_amount,total_amount,currency,issued_at,due_at)
  values(p_number,v_job.franchise_id,v_job.shop_id,v_job.customer_id,v_job.id,'ISSUED',v_job.estimate_amount,0,v_job.estimate_amount,'KES',now(),now()+interval '7 days')
  returning id into v_invoice_id;
  insert into invoice_lines(invoice_id,description,quantity,unit_price,line_total)
  values(v_invoice_id,coalesce(nullif(v_job.estimate_note,''),'Repair work for '||v_job.reference),1,v_job.estimate_amount,v_job.estimate_amount);
  insert into notifications(user_id,title,body,type,data)
  values(v_job.customer_id,'Repair invoice ready','Your garage has issued an invoice for '||v_job.reference||'.','INVOICE_ISSUED',jsonb_build_object('invoiceId',v_invoice_id,'jobId',v_job.id));
  insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id,metadata)
  values(p_actor_id,v_job.franchise_id,'INVOICE_ISSUED','Invoice',v_invoice_id,jsonb_build_object('jobId',v_job.id));
  return v_invoice_id;
end $$;
revoke all on function public.issue_repair_invoice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.issue_repair_invoice(uuid,uuid,text) to service_role;
