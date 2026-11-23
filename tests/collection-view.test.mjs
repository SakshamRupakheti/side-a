import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("the actual carousel renders guest discovery, the empty sleeve and only nearby saved records", async (t) => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
  });
  t.after(() => server.close());
  const { ListeningDeck } = await server.ssrLoadModule(
    "/src/ListeningDeck.tsx",
  );
  const render = (props) =>
    renderToStaticMarkup(createElement(ListeningDeck, props));
  const guest = render({});
  assert.match(guest, /DISCOVERY PREVIEW/);
  assert.match(guest, /Song Exploder/);
  assert.match(render({ lab: true }), /aria-label="Swipe lab"/);
  for (const total of [0, 1, 2, 7, 1025]) {
    const start = Math.max(0, total - 25);
    const entries = Array.from({ length: total - start }, (_, index) => ({
      id: "cover-" + (start + index),
      created_at: "2026-01-01T00:00:00.000Z",
      title: "Private title " + (start + index),
      creator: "Owner",
      show_name: "",
      kind: ["podcast", "audiobook", "documentary"][index % 3],
      status: ["want", "listening", "finished"][index % 3],
      artwork: "",
      url: "",
    }));
    const slot = total === 7 ? 3 : Math.max(0, total - 1);
    const markup = render({
      personal: {
        page: { start, total, entries, revision: 1 },
        focus: { slot, animate: false },
      },
    });
    assert.match(markup, /YOUR COLLECTION/);
    assert.doesNotMatch(
      markup,
      /EDITOR.S ROTATION|Song Exploder|DISCOVERY PREVIEW/,
    );
    assert.equal(
      (markup.match(/class="sleeve"/g) || []).length,
      Math.min(total, slot === 3 ? 7 : 4),
    );
    assert.equal(
      (markup.match(/aria-pressed="true"/g) || []).length,
      total ? 1 : 0,
    );
    if (total) {
      assert.ok(markup.includes("Open record Private title " + slot));
      assert.match(markup, /class="type-sleeve"/);
      assert.match(markup, /tabindex="0"|tabIndex="0"/i);
    } else {
      assert.match(markup, /Add your first listen/);
      assert.doesNotMatch(markup, /class="rail"/);
    }
  }
});
