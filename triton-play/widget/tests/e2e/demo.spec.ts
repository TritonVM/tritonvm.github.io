import { expect, test } from "@playwright/test";

function collectBrowserErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  return errors;
}

async function computedColor(locator: import("@playwright/test").Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).color);
}

async function editorLines(widget: import("@playwright/test").Locator): Promise<string[]> {
  return widget.locator(".tp-editor-container .cm-line").evaluateAll((lines) =>
    lines.map((line) => ((line.textContent ?? "").replace(/\u200b/g, ""))),
  );
}

test("custom-element demo runs and returns output", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const firstWidget = page.locator("triton-playground").first();
  await expect(firstWidget).toBeVisible();

  const runButton = firstWidget.locator(".tp-btn-run");
  await expect(runButton).toBeVisible();
  await runButton.click();

  const output = firstWidget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });
  await expect(output).toContainText("89", { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("host-mounted widget can be run from host button", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const hostRunButton = page.locator("#host-run");
  await expect(hostRunButton).toBeVisible();
  await hostRunButton.click();

  const hostWidget = page.locator("#host-widget");
  const output = hostWidget.locator(".tp-output");

  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });
  await expect(output).toContainText("42", { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("output enforces a minimum width inside narrow hosts", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const firstWidget = page.locator("triton-playground").first();
  await expect(firstWidget).toBeVisible();

  await firstWidget.evaluate((el) => {
    (el as HTMLElement).style.width = "320px";
  });

  const runButton = firstWidget.locator(".tp-btn-run");
  await expect(runButton).toBeVisible();
  await runButton.click();

  const output = firstWidget.locator(".tp-output");
  const outputContent = firstWidget.locator(".tp-output-content");

  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });
  await expect(outputContent).toContainText("89", { timeout: 15_000 });

  const widths = await output.evaluate((el) => ({
    clientWidth: (el as HTMLElement).clientWidth,
    scrollWidth: (el as HTMLElement).scrollWidth,
  }));
  const contentMetrics = await outputContent.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      minWidth: Number.parseFloat(style.minWidth),
      width: el.getBoundingClientRect().width,
    };
  });

  expect(widths.scrollWidth).toBeGreaterThan(widths.clientWidth);
  expect(contentMetrics.width).toBeGreaterThan(widths.clientWidth);
  expect(contentMetrics.width).toBeGreaterThanOrEqual(contentMetrics.minWidth - 1);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("applies Triton syntax highlighting categories", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const firstWidget = page.locator("triton-playground").first();
  await expect(firstWidget).toBeVisible();

  // Categories come from the first example's source: `push` (stack),
  // `call` (control), and `call fib_loop` (label reference).
  await expect(firstWidget.locator(".tp-tok-cat-stack").first()).toBeVisible();
  await expect(firstWidget.locator(".tp-tok-cat-control").first()).toBeVisible();
  await expect(firstWidget.locator(".tp-tok-label-ref").first()).toBeVisible();

  const stackColor = await computedColor(
    firstWidget.locator(".tp-tok-cat-stack").first(),
  );
  const controlColor = await computedColor(
    firstWidget.locator(".tp-tok-cat-control").first(),
  );
  expect(stackColor).not.toBe(controlColor);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("highlights same-line opcodes after no-arg instructions", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const hostWidget = page.locator("#host-widget");
  await expect(hostWidget).toBeVisible();

  const editorContent = hostWidget.locator(".tp-editor-container .cm-content");
  await expect(editorContent).toBeVisible();

  async function setEditorLine(line: string): Promise<void> {
    await editorContent.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(line);
  }

  await setEditorLine("skiz halt");
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^skiz$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^halt$/,
    }),
  ).toHaveCount(1);

  await setEditorLine("halt skiz push 5");
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^halt$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^skiz$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-stack").filter({
      hasText: /^push$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-number").filter({
      hasText: /^5$/,
    }),
  ).toHaveCount(1);

  await setEditorLine("skiz halt skiz");
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^skiz$/,
    }),
  ).toHaveCount(2);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^halt$/,
    }),
  ).toHaveCount(1);

  await setEditorLine("skiz halt // c");
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^skiz$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^halt$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-comment").filter({
      hasText: /\/\/ c/,
    }),
  ).toHaveCount(1);

  await setEditorLine("halt skiz push 5 // c");
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^halt$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-control").filter({
      hasText: /^skiz$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-cat-stack").filter({
      hasText: /^push$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-number").filter({
      hasText: /^5$/,
    }),
  ).toHaveCount(1);
  await expect(
    hostWidget.locator(".tp-editor-container .cm-content .tp-tok-comment").filter({
      hasText: /\/\/ c/,
    }),
  ).toHaveCount(1);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("explicit light and dark theme hints are applied", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const explicitLight = page.locator("#theme-light-widget");
  const explicitDark = page.locator("#theme-dark-widget");

  await expect(explicitLight).toBeVisible();
  await expect(explicitDark).toBeVisible();

  await expect(explicitLight).toHaveAttribute("data-tp-theme", "light");
  await expect(explicitDark).toHaveAttribute("data-tp-theme", "dark");

  const lightStack = explicitLight.locator(".tp-tok-cat-stack").first();
  const darkMany = explicitDark.locator(".tp-tok-cat-many").first();
  await expect(lightStack).toBeVisible();
  await expect(darkMany).toBeVisible();

  const lightColor = await computedColor(lightStack);
  const darkColor = await computedColor(darkMany);
  expect(lightColor).not.toBe(darkColor);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("shows an error when wasm fetch is broken", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  // Canary: emulate a server-side wasm regression (bad MIME/body).
  await page.route("**/*.wasm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "not-a-wasm-binary",
    });
  });

  await page.goto("/");

  const firstWidget = page.locator("triton-playground").first();
  await expect(firstWidget).toBeVisible();

  const runButton = firstWidget.locator(".tp-btn-run");
  await runButton.click();

  const output = firstWidget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-error/, { timeout: 15_000 });

  const outputText = (await output.textContent()) ?? "";
  const observedErrorText = [outputText, ...browserErrors].join("\n").toLowerCase();

  expect(
    observedErrorText,
    `expected wasm-related failure message, got:\n${observedErrorText}`,
  ).toMatch(/wasm|webassembly|mime|compileerror|instantiate/);
});

test("preserves blank lines from markdown-like host markup", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const widgetId = "markup-source-widget";
  await page.evaluate((id) => {
    const host = document.createElement("triton-playground");
    host.id = id;
    host.innerHTML = [
      "<p>push 1</p>",
      "<p></p>",
      "<p>push 2</p>",
      "<p>add</p>",
      "<p>write_io 1</p>",
      "<p>halt</p>",
    ].join("");
    document.body.append(host);
  }, widgetId);

  const widget = page.locator(`#${widgetId}`);
  await expect(widget).toBeVisible();

  const lines = await editorLines(widget);
  expect(lines).toContain("");

  const runButton = widget.locator(".tp-btn-run");
  await runButton.click();

  const output = widget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });
  await expect(output).toContainText("3", { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("preserves line breaks inside markdown block text", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const widgetId = "markdown-linebreak-widget";
  await page.evaluate((id) => {
    const host = document.createElement("triton-playground");
    host.id = id;
    host.innerHTML = [
      "<p>call my_label\nhalt</p>",
      "<p>my_label:\n// do something\nreturn</p>",
    ].join("");
    document.body.append(host);
  }, widgetId);

  const widget = page.locator(`#${widgetId}`);
  await expect(widget).toBeVisible();

  const lines = await editorLines(widget);
  expect(lines.slice(0, 6)).toEqual([
    "call my_label",
    "halt",
    "",
    "my_label:",
    "// do something",
    "return",
  ]);

  const runButton = widget.locator(".tp-btn-run");
  await runButton.click();

  const output = widget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("trims only outer blank lines for inline source text", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const widgetId = "inline-source-trim-widget";
  await page.evaluate((id) => {
    const host = document.createElement("triton-playground");
    host.id = id;
    host.textContent = [
      "",
      "call my_label",
      "halt",
      "",
      "my_label:",
      "// do something",
      "return",
      "",
    ].join("\n");
    document.body.append(host);
  }, widgetId);

  const widget = page.locator(`#${widgetId}`);
  await expect(widget).toBeVisible();

  const lines = await editorLines(widget);
  expect(lines).toEqual([
    "call my_label",
    "halt",
    "",
    "my_label:",
    "// do something",
    "return",
  ]);

  const runButton = widget.locator(".tp-btn-run");
  await runButton.click();

  const output = widget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("preserves leading indentation in inline source text", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const widgetId = "inline-source-indentation-widget";
  await page.evaluate((id) => {
    const host = document.createElement("triton-playground");
    host.id = id;
    host.textContent = [
      "",
      "    call my_label",
      "      halt",
      "",
      "    my_label:",
      "      // do something",
      "    return",
      "",
    ].join("\n");
    document.body.append(host);
  }, widgetId);

  const widget = page.locator(`#${widgetId}`);
  await expect(widget).toBeVisible();

  const lines = await editorLines(widget);
  expect(lines).toEqual([
    "    call my_label",
    "      halt",
    "",
    "    my_label:",
    "      // do something",
    "    return",
  ]);

  const runButton = widget.locator(".tp-btn-run");
  await runButton.click();

  const output = widget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("preserves explicit template source indentation", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  const widgetId = "template-source-widget";
  await page.evaluate((id) => {
    const host = document.createElement("triton-playground");
    host.id = id;
    host.innerHTML = `
      <template data-tp-source>
    call my_label
    halt

    my_label:
      // do something
    return
      </template>
    `;
    document.body.append(host);
  }, widgetId);

  const widget = page.locator(`#${widgetId}`);
  await expect(widget).toBeVisible();

  const lines = await editorLines(widget);
  expect(lines).toEqual([
    "    call my_label",
    "    halt",
    "",
    "    my_label:",
    "      // do something",
    "    return",
  ]);

  const runButton = widget.locator(".tp-btn-run");
  await runButton.click();

  const output = widget.locator(".tp-output");
  await expect(output).toHaveClass(/tp-success/, { timeout: 15_000 });

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

