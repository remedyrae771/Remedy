-- Ежечасный запуск функции напоминаний (reminders): сама функция решает,
-- наступило ли 9:00 или 20:00 по времени пары, и не повторяет напоминания (reminder_log).
-- Применить после развёртывания функции reminders (Verify JWT выключен).

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'remedy-reminders';

select cron.schedule(
  'remedy-reminders',
  '2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ksuamdunohzzstukmktj.supabase.co/functions/v1/reminders',
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    )
  $cron$
);
