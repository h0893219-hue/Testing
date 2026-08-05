(() => {
  "use strict";

  const container = document.getElementById("serverWidgetChannels");
  const summary = document.getElementById("serverWidgetSummary");

  if (!container || !summary) return;

  const icons = {
    text: "#",
    announcement: "📣",
    forum: "▤",
    voice: "🔊",
    stage: "◉",
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function unavailable() {
    summary.textContent = "Derzeit nicht verfügbar";
    container.replaceChildren(
      node(
        "div",
        "server-widget-unavailable",
        "Der Server-Status ist momentan nicht verfügbar.",
      ),
    );
    container.setAttribute("aria-busy", "false");
  }

  function render(data) {
    if (!data?.updated_at || !Array.isArray(data.categories)) {
      unavailable();
      return;
    }

    const fragment = document.createDocumentFragment();
    let channelTotal = 0;
    let voiceTotal = 0;

    for (const category of data.categories) {
      const section = node("section", "server-category");
      section.appendChild(
        node("h3", "server-category-title", category.label),
      );

      for (const channel of category.channels) {
        channelTotal += 1;

        const row = node("div", "server-channel");
        row.appendChild(
          node("span", "server-channel-icon", icons[channel.type]),
        );
        row.appendChild(
          node("span", "server-channel-name", channel.label),
        );

        if (channel.type === "voice" || channel.type === "stage") {
          voiceTotal += channel.count;

          row.appendChild(
            node(
              "span",
              "server-channel-count",
              `${channel.count} anwesend`,
            ),
          );

          if (channel.count > 0) {
            const members = node("div", "anonymous-members");
            members.setAttribute(
              "aria-label",
              `${channel.count} anonyme Personen anwesend`,
            );

            const visible = Math.min(channel.count, 8);
            for (let index = 0; index < visible; index += 1) {
              const avatar = node("span", "anonymous-avatar");
              avatar.setAttribute("aria-hidden", "true");
              members.appendChild(avatar);
            }

            if (channel.count > visible) {
              members.appendChild(
                node(
                  "span",
                  "anonymous-overflow",
                  `+${channel.count - visible}`,
                ),
              );
            }

            row.appendChild(members);
          }
        }

        section.appendChild(row);
      }

      fragment.appendChild(section);
    }

    summary.textContent = `${channelTotal} Kanäle · ${voiceTotal} im Voice`;

    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "false");
  }

  async function refresh() {
    if (document.hidden) return;

    try {
      const response = await fetch("/api/server-widget", {
        credentials: "omit",
        headers: { Accept: "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        unavailable();
        return;
      }

      render(data);
    } catch {
      unavailable();
    }
  }

  refresh();
  setInterval(refresh, 15000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
})();
