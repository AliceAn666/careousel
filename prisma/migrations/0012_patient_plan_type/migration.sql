-- Each patient carries a fictional PPO or HMO plan type with their insurer.
ALTER TABLE "User" ADD COLUMN "planType" TEXT CHECK ("planType" IN ('PPO','HMO'));
-- Give every existing synthetic patient one deterministic plan type.
UPDATE "User" SET "planType" = CASE WHEN get_byte(decode(md5("id"), 'hex'), 0) % 2 = 0 THEN 'PPO' ELSE 'HMO' END WHERE "role" = 'PATIENT';
