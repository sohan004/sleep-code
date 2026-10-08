import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "html-css",
  project: "harbour-ferry-timetable",
  branch: "feat/accessible-timetable",
  indent: "Spaces: 2",
  files: [
    "index.html",
    "styles/main.css",
    "styles/reset.css",
    "scripts/timetable.js",
    "assets/logo.svg",
    "assets/favicon.ico",
    "robots.txt",
    "README.md",
  ],
  snippets: [
    {
      filename: "index.html",
      syntax: "markup",
      languageLabel: "HTML",
      code: `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Live ferry departures and route timetables.">
  <meta name="color-scheme" content="light dark">
  <title>Harbour Ferry Timetable</title>
  <link rel="icon" href="/assets/favicon.ico">
  <link rel="preload" href="/styles/main.css" as="style">
  <link rel="stylesheet" href="/styles/reset.css">
  <link rel="stylesheet" href="/styles/main.css">
  <script type="module" src="/scripts/timetable.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to timetable</a>
  <header class="site-header">
    <img src="/assets/logo.svg" alt="" width="40" height="40">
    <h1>Harbour Ferry Timetable</h1>
    <nav aria-label="Primary">
      <ul role="list">
        <li><a href="/" aria-current="page">Departures</a></li>
        <li><a href="/routes">Routes</a></li>
        <li><a href="/alerts">Service alerts</a></li>
      </ul>
    </nav>
  </header>

  <main id="main">
    <section aria-labelledby="search-heading" class="card">
      <h2 id="search-heading">Find a departure</h2>
      <form class="search-form" action="/departures" method="get">
        <div class="field">
          <label for="wharf">From wharf</label>
          <select id="wharf" name="wharf" required>
            <option value="">Choose a wharf</option>
            <option value="central">Central Quay</option>
            <option value="north">North Point</option>
            <option value="eastbay">East Bay</option>
          </select>
        </div>
        <div class="field">
          <label for="time">Leaving after</label>
          <input id="time" name="time" type="time" step="300" aria-describedby="time-hint">
          <p id="time-hint" class="hint">Leave blank for the next departures.</p>
        </div>
        <button type="submit" class="button">Show departures</button>
      </form>
    </section>

    <section aria-labelledby="next-heading" class="card">
      <h2 id="next-heading">Next departures</h2>
      <p class="status" role="status" aria-live="polite">Updated 2 minutes ago</p>
      <table class="timetable">
        <caption class="visually-hidden">Departures from Central Quay</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Route</th>
            <th scope="col">Destination</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><time datetime="08:15">8:15 am</time></td>
            <td><span class="route route--f1">F1</span></td>
            <td>North Point</td>
            <td><span class="badge badge--ok">On time</span></td>
          </tr>
          <tr>
            <td><time datetime="08:25">8:25 am</time></td>
            <td><span class="route route--f3">F3</span></td>
            <td>East Bay</td>
            <td><span class="badge badge--late">Delayed 5 min</span></td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>

  <footer class="site-footer">
    <p>Times are local. Check service alerts before you travel.</p>
  </footer>
</body>
</html>`,
    },
    {
      filename: "styles/main.css",
      syntax: "css",
      languageLabel: "CSS",
      code: `/* Harbour Ferry Timetable: main stylesheet */
@layer reset, tokens, layout, components, utilities;

@layer tokens {
  :root {
    --colour-bg: light-dark(#f7f9fb, #0f1720);
    --colour-surface: light-dark(#ffffff, #18222e);
    --colour-text: light-dark(#14202b, #e6edf3);
    --colour-muted: light-dark(#5a6b7b, #9fb0c0);
    --colour-accent: light-dark(#0b5cad, #6cb4ff);
    --colour-ok: light-dark(#1b7f3b, #5fd38a);
    --colour-late: light-dark(#a24b00, #ffb366);
    --radius: 0.75rem;
    --space: clamp(1rem, 2vw + 0.5rem, 1.5rem);
  }
}

@layer layout {
  body {
    background: var(--colour-bg);
    color: var(--colour-text);
    font: 1rem/1.5 system-ui, sans-serif;
  }

  main {
    display: grid;
    gap: var(--space);
    max-inline-size: 64rem;
    margin-inline: auto;
    padding: var(--space);
  }

  @media (min-width: 48rem) {
    main {
      grid-template-columns: minmax(18rem, 1fr) 2fr;
    }
  }
}

@layer components {
  .card {
    background: var(--colour-surface);
    border-radius: var(--radius);
    padding: var(--space);
    container-type: inline-size;
  }

  .search-form { display: grid; gap: 1rem; }

  .field label {
    display: block;
    font-weight: 600;
    margin-block-end: 0.25rem;
  }

  .button {
    background: var(--colour-accent);
    color: white;
    border: 0;
    border-radius: calc(var(--radius) / 2);
    padding: 0.625rem 1rem;
    cursor: pointer;
  }

  .button:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--colour-accent);
    outline-offset: 2px;
  }

  .timetable { inline-size: 100%; border-collapse: collapse; }

  .timetable :is(th, td) {
    padding: 0.5rem;
    text-align: start;
    border-block-end: 1px solid color-mix(in oklab, var(--colour-muted) 30%, transparent);
  }

  .badge--ok { color: var(--colour-ok); }
  .badge--late { color: var(--colour-late); }

  @container (max-width: 30rem) {
    .timetable th:nth-child(4),
    .timetable td:nth-child(4) {
      display: none;
    }
  }
}

@layer utilities {
  .visually-hidden {
    position: absolute;
    clip-path: inset(50%);
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    white-space: nowrap;
  }
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content: "On narrow screens the timetable overflows. Should I hide columns with a media query or something else?",
      delay: 3000,
    },
    {
      role: "assistant",
      content: "Since `.card` already sets `container-type: inline-size`, a **container query** is the better fit. The table reacts to the width of its card rather than the viewport, so it behaves correctly in the two-column grid on desktop too.\n\nOne caution: hiding the Status column with `display: none` removes it from the accessibility tree as well. If delay information matters, consider folding it into the Destination cell on small widths instead, for example a visually-hidden span that becomes visible inside the container query. That way screen reader users never lose the delay notice.",
      delay: 11000,
    },
    {
      role: "user",
      content: "Good point. Is light-dark() safe to use now, or do I need a fallback?",
      delay: 22000,
    },
    {
      role: "assistant",
      content: "`light-dark()` is Baseline across current Chrome, Edge, Firefox and Safari, so it is safe for most audiences. It only works when `color-scheme` is set, which you have via the `<meta name=\"color-scheme\">` tag. Adding it on `:root` in CSS as well is a good belt-and-braces step:\n\n```css\n:root { color-scheme: light dark; }\n```\n\nIf you must support older browsers, declare a plain colour first and the `light-dark()` value second. Browsers that do not understand it ignore the second declaration and keep the fallback.",
      delay: 34000,
    },
    {
      role: "user",
      content: "Last thing: the status line says 'Updated 2 minutes ago'. Will aria-live spam screen readers when JS refreshes it?",
      delay: 47000,
    },
    {
      role: "assistant",
      content: "`role=\"status\"` already implies `aria-live=\"polite\"`, so the announcement waits until the user is idle rather than interrupting. To avoid noise:\n\n1. Only update the text when the data actually changes, not on every tick of a relative-time timer.\n2. Announce meaningful changes, such as \"2 services delayed\", rather than the timestamp.\n3. Keep the relative time in a separate element outside the live region.\n\nThat keeps the region useful without becoming a constant stream of announcements.",
      delay: 58000,
    },
  ],
};

export default config;
