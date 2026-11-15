import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, workers: 1,
  use: { headless: true, viewport: {width:1280,height:900},
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox']} : {},
    trace: 'retain-on-failure', screenshot:'only-on-failure' },
  projects: [{name:'desktop'}, {name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
});
