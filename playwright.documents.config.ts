import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:['electronicDocumentsUi.spec.ts','attendanceSettingsUi.spec.ts'],workers:1,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:390,height:844},acceptDownloads:true},
  webServer:{command:'npx vite --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173/tests/ui/documents.html',reuseExistingServer:!process.env.CI},
});
