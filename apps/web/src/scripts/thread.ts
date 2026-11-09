import { animate, inView, stagger } from "motion";
import { clockFor, conversations, traceFor, type Exchange } from "../data/conversations";
import { cue } from "./sound";

const EASE = [0.22, 1, 0.36, 1] as const;
const BUBBLE = { type: "spring", stiffness: 520, damping: 28, mass: 0.9 } as const;

/** How fast the question types itself out, per character. */
const CHAR_MS = 22;

/** The phone arrives, then the camera pulls back, then the conversation runs. */
const FLY = { in: 0, zoom: 620, log: 860, compose: 1040 };

/** How long the finished conversation rests before the loop starts over. */
const LOOP_PAUSE = 4000;

export type Thread = { replay: () => void; destroy: () => void };

export function initThread(): Thread | null {
  const root = document.querySelector<HTMLElement>("[data-thread-window]");
  if (!root) return null;

  const phone = root.querySelector<HTMLElement>("[data-phone]");
  const log = root.querySelector<HTMLElement>(".log");
  const compose = root.querySelector<HTMLElement>("[data-compose]");
  const out = root.querySelector<HTMLElement>('[data-step="out"]');
  const receipt = root.querySelector<HTMLElement>('[data-step="receipt"]');
  const typing = root.querySelector<HTMLElement>('[data-step="typing"]');
  const reply = root.querySelector<HTMLElement>('[data-step="in"]');
  const status = root.querySelector<HTMLElement>("[data-log-status]");
  const clockEl = root.querySelector<HTMLElement>("[data-clock]");
  const dayEl = root.querySelector<HTMLElement>("[data-day]");
  const replayButton = root.querySelector<HTMLButtonElement>("[data-replay]");
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-log-row]"));
  const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));

  if (!phone || !log || !compose || !out || !receipt || !typing || !reply) return null;

  let question = out.textContent?.trim() ?? "";
  let lastIndex = 0;
  const bubbles = [out, receipt, reply];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let timers: number[] = [];
  let dotLoop: ReturnType<typeof animate> | null = null;

  // The loop only turns over while the hero is on screen and the tab is in
  // front, so it never animates or sounds off to the side of the page.
  let onScreen = false;
  let active = false;
  const looping = !reduced.matches;

  function cells(row: HTMLElement) {
    return Array.from(row.children) as HTMLElement[];
  }

  /** A different exchange each time round, never the same one twice running. */
  function pick(): Exchange {
    if (conversations.length < 2) return conversations[0]!;
    let i = lastIndex;
    while (i === lastIndex) i = Math.floor(Math.random() * conversations.length);
    lastIndex = i;
    return conversations[i]!;
  }

  /** Swaps in the question, the answer, the clock and the matching log rows. */
  function applyExchange(exchange: Exchange) {
    question = exchange.question;
    out!.textContent = exchange.question;
    reply!.textContent = exchange.reply;

    const clock = clockFor(exchange);
    if (clockEl) clockEl.textContent = clock;
    if (dayEl) dayEl.textContent = clock;

    traceFor(exchange).forEach((row, i) => {
      const target = rows[i];
      if (!target) return;
      const [time, actor, event, delta] = cells(target);
      if (time) time.textContent = row.at;
      if (actor) actor.textContent = row.actor;
      if (event) event.textContent = row.event;
      if (delta) delta.textContent = row.delta;
    });
  }

  function clear() {
    for (const id of timers) window.clearTimeout(id);
    timers = [];
    dotLoop?.stop();
    dotLoop = null;
  }

  function at(ms: number, run: () => void) {
    timers.push(window.setTimeout(run, ms));
  }

  function present(el: HTMLElement) {
    el.hidden = false;
    el.style.opacity = "1";
    el.style.transform = "none";
  }

  function setStatus(state: "streaming" | "idle") {
    root!.dataset.logState = state;
    if (status) status.textContent = state;
  }

  function show(el: HTMLElement) {
    el.hidden = false;
    if (reduced.matches) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }
    animate(el, { opacity: [0, 1], scale: [0.72, 1] }, BUBBLE);
  }

  function reveal(index: number) {
    const row = rows[index];
    if (!row) return;
    if (reduced.matches) {
      for (const cell of cells(row)) cell.style.opacity = "1";
      return;
    }
    animate(cells(row), { opacity: [0, 1], y: [4, 0] }, { duration: 0.26, ease: EASE });
  }

  function startTyping() {
    show(typing!);
    if (reduced.matches) return;
    dotLoop = animate(
      dots,
      { opacity: [0.3, 1], scale: [0.78, 1] },
      {
        duration: 0.5,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "mirror",
        delay: stagger(0.14),
      },
    );
  }

  function stopTyping() {
    dotLoop?.stop();
    dotLoop = null;
    typing!.hidden = true;
  }

  /** The phone flies up into frame, then the camera pulls back to rest. */
  function flyIn() {
    if (reduced.matches) {
      present(phone!);
      present(log!);
      return;
    }

    // Both start hidden; the log only joins once the phone has settled.
    phone!.style.opacity = "0";
    log!.style.opacity = "0";

    animate(
      phone!,
      { opacity: [0, 1], y: [120, 0], rotateX: [14, 0], scale: [1.18, 1.18] },
      { duration: 0.7, ease: EASE },
    );

    at(FLY.zoom, () => animate(phone!, { scale: [1.18, 1] }, { duration: 0.65, ease: EASE }));
    at(FLY.log, () =>
      animate(log!, { opacity: [0, 1], x: [-16, 0] }, { duration: 0.5, ease: EASE }),
    );
  }

  /** Types the question into the compose field, one character at a time. */
  function typeQuestion(done: () => void) {
    root!.dataset.composeState = "typing";

    if (reduced.matches) {
      compose!.textContent = question;
      at(200, done);
      return;
    }

    let i = 0;
    const step = () => {
      i += 1;
      compose!.textContent = question.slice(0, i);

      // Cuelume throttles `type` to one every 40ms, so cue every other character.
      if (i % 2 === 0) cue("type", { emphasis: "subtle" });

      if (i < question.length) at(CHAR_MS, step);
      else done();
    };

    at(CHAR_MS, step);
  }

  /** Everything delivered — the state the page also renders without JavaScript. */
  function settle() {
    clear();
    stopTyping();
    present(phone!);
    present(log!);
    for (const el of bubbles) present(el);
    for (const row of rows) for (const cell of cells(row)) cell.style.opacity = "1";
    compose!.textContent = "";
    root!.dataset.composeState = "idle";
    setStatus("idle");
  }

  function play() {
    clear();
    stopTyping();

    const exchange = pick();
    applyExchange(exchange);

    // Compressed, but a slower answer in the log is a visibly longer wait.
    const think = Math.min(2200, Math.max(1100, Math.round(exchange.took * 600)));

    for (const el of bubbles) el.hidden = true;
    for (const row of rows) for (const cell of cells(row)) cell.style.opacity = "0";
    compose!.textContent = "";
    root!.dataset.composeState = "idle";
    setStatus("idle");

    flyIn();

    at(FLY.compose, () =>
      typeQuestion(() => {
        // The rest of the beats hang off the moment the question is finished.
        at(220, () => {
          compose!.textContent = "";
          root!.dataset.composeState = "idle";
          show(out!);
          cue("tap");
          reveal(0);
          setStatus("streaming");
        });

        at(580, () => {
          show(receipt!);
          reveal(1);
        });

        at(920, () => {
          startTyping();
          cue("loading", { emphasis: "subtle" });
          reveal(2);
        });

        at(920 + think, () => {
          stopTyping();
          show(reply!);
          cue("ready", { emphasis: "subtle" });
          reveal(3);
        });

        at(920 + think + 500, () => {
          setStatus("idle");
          if (looping && active) at(LOOP_PAUSE, play);
        });
      }),
    );
  }

  function resume() {
    if (!looping || !onScreen || document.hidden || active) return;
    active = true;
    play();
  }

  function pause() {
    active = false;
    settle();
  }

  typing.hidden = true;
  settle();
  document.documentElement.dataset.ready = "on";

  const onReplay = () => {
    active = looping;
    play();
  };
  replayButton?.addEventListener("click", onReplay);

  const onVisibility = () => {
    if (document.hidden) pause();
    else resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const stopInView = inView(
    root,
    () => {
      onScreen = true;
      resume();
      return () => {
        onScreen = false;
        pause();
      };
    },
    // Half the hero has to be showing. The page is short enough that a smaller
    // threshold would keep the loop running while the sections below are read.
    { amount: 0.5 },
  );

  return {
    replay: play,
    destroy() {
      active = false;
      clear();
      stopInView();
      replayButton?.removeEventListener("click", onReplay);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
