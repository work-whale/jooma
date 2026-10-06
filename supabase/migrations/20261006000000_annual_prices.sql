-- Yearly billing for Standard, Pro and Max.
--
-- Data only: plan_config.price_yearly and stripe_price_yearly have existed
-- since the billing migration. The yearly figures there were never sold (Pro
-- read 79.00, Max 149.00, Standard nothing), and the admin console reads them,
-- so they are brought in line with what Checkout now charges:
--
--   Standard  GBP 47.99 a year  (12 x 4.99 = 59.88)
--   Pro       GBP 71.99 a year  (12 x 7.99 = 95.88)
--   Max       GBP 143.99 a year (12 x 14.99 = 179.88)
--
-- stripe_price_yearly is left null on purpose, the same as stripe_price_monthly
-- was for Standard: price ids differ per environment, and priceIdFor() falls
-- back to STRIPE_PRICE_<PLAN>_YEARLY.

update plan_config set price_yearly = 47.99,  updated_at = now() where plan_id = 'standard';
update plan_config set price_yearly = 71.99,  updated_at = now() where plan_id = 'pro';
update plan_config set price_yearly = 143.99, updated_at = now() where plan_id = 'max';
