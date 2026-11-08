import type { PlayOptions, SoundName } from "cuelume";

type Cuelume = typeof import("cuelume");

const STORAGE_KEY = "grok-imessage:sound";

let api: Cuelume | null = null;
let loading: Promise<Cuelume> | null = null;
let enabled = false;

/** The audio engine is only worth downloading once somebody wants to hear it. */
function load(): Promise<Cuelume> {
  loading ??= import("cuelume");
  return loading;
}

/** Plays a cue only while the visitor has sound switched on. */
export function cue(name: SoundName, options?: PlayOptions) {
  if (!enabled) return;
  api?.play(name, options);
}

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function write(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // Private browsing: the preference just doesn't outlive the tab.
  }
}

function sync(button: HTMLButtonElement) {
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute(
    "aria-label",
    enabled ? "Turn interface sound off" : "Turn interface sound on",
  );
}

/**
 * Wires the sound toggle. `onEnable` runs when sound is switched on, so the
 * hero can replay itself and the cues are actually heard.
 */
export function initSound(onEnable?: () => void) {
  const button = document.querySelector<HTMLButtonElement>("[data-sound-toggle]");
  if (!button) return;

  // Fetch the engine on the first interaction anywhere, so the toggle can start
  // audio inside its own gesture — Safari will not start it after an await.
  const warm = () => void load();
  document.addEventListener("pointerdown", warm, { once: true, passive: true });
  document.addEventListener("keydown", warm, { once: true });

  if (read()) {
    enabled = true;
    void load().then((mod) => {
      api = mod;
      mod.bind();
      mod.setEnabled(true);
    });
  }

  sync(button);

  button.addEventListener("click", async () => {
    if (enabled) {
      enabled = false;
      api?.setEnabled(false);
      write(false);
      sync(button);
      return;
    }

    const mod = await load();
    api = mod;
    await mod.unlock();
    mod.bind();
    mod.setEnabled(true);

    enabled = true;
    write(true);
    sync(button);

    mod.play("toggle");
    onEnable?.();
  });
}
