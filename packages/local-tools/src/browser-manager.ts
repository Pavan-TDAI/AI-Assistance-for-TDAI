import { chromium, type Browser, type Page } from "playwright";

export class BrowserSessionManager {
  private browser?: Browser;
  private page?: Page;

  constructor(private readonly headless: boolean) {}

  private async ensurePage() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }

    if (!this.page) {
      const context = await this.browser.newContext();
      this.page = await context.newPage();
    }

    return this.page;
  }

  async navigate(url: string) {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    return {
      title: await page.title(),
      url: page.url()
    };
  }

  async click(selector: string) {
    const page = await this.ensurePage();
    await page.click(selector);

    return { selector };
  }

  async type(selector: string, text: string, submit = false) {
    const page = await this.ensurePage();
    await page.fill(selector, text);
    if (submit) {
      await page.press(selector, "Enter");
    }

    return { selector };
  }

  async extractText(selector = "body") {
    const page = await this.ensurePage();
    const text = await page.locator(selector).innerText();
    return { selector, text: text.slice(0, 12000) };
  }

  async close() {
    await this.page?.context().close();
    await this.browser?.close();
    this.page = undefined;
    this.browser = undefined;
  }
}
