const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");
const path = require("path");
const request = require("request");
require("dotenv").config();

const extensionId = "caacbgbklghmpodbdafajbgdnegacfmo";
const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=98.0.4758.102&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc&nacl_arch=x86-64`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36";

const USER = process.env.APP_USER || "";
const PASSWORD = process.env.APP_PASS || "";
const ALLOW_DEBUG = process.env.ALLOW_DEBUG === "True";
const EXTENSION_FILENAME = "app.crx";

console.log("-> Starting...");
console.log("-> User:", USER);
console.log("-> Pass:", PASSWORD);
console.log("-> Debug:", ALLOW_DEBUG);

if (!USER || !PASSWORD) {
  console.error("Please set APP_USER and APP_PASS env variables");
  process.exit();
}

if (ALLOW_DEBUG) {
  console.log("-> Debugging is enabled! This will generate a screenshot and console logs on error!");
}

async function downloadExtension() {
  const url = CRX_URL;
  const headers = { "User-Agent": USER_AGENT };

  console.log("-> Downloading extension from:", url);

  // if file exists and modify time is less than 1 day, skip download
  if (fs.existsSync(EXTENSION_FILENAME) && fs.statSync(EXTENSION_FILENAME).mtime > Date.now() - 86400000) {
    console.log("-> Extension already downloaded! skip download...");
    return;
  }

  return new Promise((resolve, reject) => {
    request({ url, headers, encoding: null }, (error, response, body) => {
      if (error) {
        console.error("Error downloading extension:", error);
        return reject(error);
      }
      fs.writeFileSync(EXTENSION_FILENAME, body);
      if (process.env.DEBUG) {
        const md5 = crypto.createHash("md5").update(body).digest("hex");
        console.log("-> Extension MD5: " + md5);
      }
      resolve();
    });
  });
}

async function takeScreenshot(driver, filename) {
  if (!process.env.DEBUG) {
    return;
  }
  const data = await driver.takeScreenshot();
  fs.writeFileSync(filename, Buffer.from(data, "base64"));
}

async function getDriverOptions() {
  const options = new chrome.Options();

  options.addArguments("--headless");
  options.addArguments(`user-agent=${USER_AGENT}`);
  options.addArguments("--remote-allow-origins=*");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-web-security");
  options.addArguments("--ignore-certificate-errors");

  if (!process.env.DEBUG) {
    options.addArguments("--blink-settings=imagesEnabled=false");
  }

  return options;
}

(async () => {
  await downloadExtension();

  const options = await getDriverOptions();
  options.addExtensions(path.resolve(__dirname, EXTENSION_FILENAME));

  console.log(`-> Extension added! ${EXTENSION_FILENAME}`);

  if (ALLOW_DEBUG) {
    options.addArguments("--enable-logging");
    options.addArguments("--v=1");
  }

  let driver;
  try {
    console.log("-> Starting browser...");
    driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

    console.log("-> Browser started!");
    await driver.get("https://app.gradient.network/");

    const emailInput = By.css('[placeholder="Enter Email"]');
    const passwordInput = By.css('[type="password"]');
    const loginButton = By.css("button");

    await driver.wait(until.elementLocated(emailInput), 30000);
    await driver.wait(until.elementLocated(passwordInput), 30000);
    await driver.wait(until.elementLocated(loginButton), 30000);

    await driver.findElement(emailInput).sendKeys(USER);
    await driver.findElement(passwordInput).sendKeys(PASSWORD);
    await driver.findElement(loginButton).click();

    await driver.wait(
      until.elementLocated(By.xpath('//*[contains(text(), "Copy Referral Link")]')),
      30000
    );

    console.log("-> Logged in! Waiting for open extension...");
    takeScreenshot(driver, "logined.png");

    await driver.get(`chrome-extension://${extensionId}/popup.html`);

    await driver.wait(
      until.elementLocated(By.xpath('//div[contains(text(), "Status")]')),
      30000
    );

    console.log("-> Extension loaded!");

    const supportStatus = await driver
      .findElement(By.css(".absolute.mt-3.right-0.z-10"))
      .getText();

    const dom = await driver.findElement(By.css("html")).getAttribute("outerHTML");
    fs.writeFileSync("dom.html", dom);

    await takeScreenshot(driver, "status.png");

    console.log("-> Status:", supportStatus);

    if (supportStatus.includes("Disconnected")) {
      console.log("-> Failed to connect! Please check the following: ");
    }
  } catch (error) {
    console.error("Error:", error);
    await generateErrorReport(driver);
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
})();
