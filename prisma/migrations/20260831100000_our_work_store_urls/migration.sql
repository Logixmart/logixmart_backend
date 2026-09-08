-- Rename projectUrl → appStoreUrl, webAppUrl → playStoreUrl
ALTER TABLE "our_works" RENAME COLUMN "projectUrl" TO "appStoreUrl";
ALTER TABLE "our_works" RENAME COLUMN "webAppUrl" TO "playStoreUrl";
