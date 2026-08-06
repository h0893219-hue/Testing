import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("places High Harvest between the team and FAQ sections", async () => {
  const html = await read("public/index.html");
  const teamPosition = html.indexOf('id="team"');
  const gamePosition = html.indexOf('id="high-harvest"');
  const faqPosition = html.indexOf('id="faq"');

  assert.ok(teamPosition >= 0, "team section is missing");
  assert.ok(gamePosition > teamPosition, "High Harvest must follow the team section");
  assert.ok(faqPosition > gamePosition, "FAQ must follow High Harvest");
});

test("links both navigations to the embedded game", async () => {
  const html = await read("public/index.html");
  const navigationLinks = html.match(/href="#high-harvest"/g) ?? [];

  assert.equal(navigationLinks.length, 2);
  assert.match(html, /<iframe[\s\S]*?src="\/high-harvest\/"[\s\S]*?<\/iframe>/);
});

test("keeps High Harvest assets relative to its deploy subpath", async () => {
  const [css, game] = await Promise.all([
    read("High-Harvest/styles.css"),
    read("High-Harvest/game.js"),
  ]);

  assert.doesNotMatch(css, /url\(["']?\/assets\//);
  assert.doesNotMatch(game, /["'`]\/assets\//);
  assert.doesNotMatch(game, /`\/\$\{(?:color\.sheet|def\.image)\}`/);
});
