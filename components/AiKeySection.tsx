"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  DEFAULT_MODEL,
  findModel,
  modelsFor,
  PROVIDERS,
  type ProviderId,
} from "@/lib/insightModels";

/**
 * Choosing where written insights are generated, and supplying a key for it.
 *
 * The honest bit is the note at the bottom. Neither provider sends CORS
 * headers, so a browser cannot call them directly and the key has to pass
 * through this app's own server to be forwarded. On a deployment you run
 * yourself that is unremarkable; on somebody else's it is a real thing to
 * know, so it is stated rather than buried.
 */
export function AiKeySection() {
  const { state, setPrefs } = useStore();
  const { prefs } = state;
  const [revealed, setRevealed] = useState(false);
  const [custom, setCustom] = useState(!findModel(prefs.aiModel));

  const provider = prefs.aiProvider as ProviderId;
  const models = modelsFor(provider);
  const selected = findModel(prefs.aiModel);

  // Grouped so 20-odd open models are navigable rather than one long list.
  const families = [...new Set(models.map((m) => m.family))];

  function switchProvider(next: ProviderId) {
    // The key belongs to the old provider, so it goes with it — carrying it
    // over would just produce a confusing rejection.
    setPrefs({
      aiProvider: next,
      aiModel: DEFAULT_MODEL[next],
      aiApiKey: "",
    });
    setCustom(false);
  }

  if (!prefs.aiInsights) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
        Where readings come from
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
          const on = provider === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchProvider(id)}
              aria-pressed={on}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95 ${
                on ? "bg-acid text-[#121a00]" : "border border-white/12 text-bone/60 hover:bg-white/8"
              }`}
            >
              {PROVIDERS[id].label}
            </button>
          );
        })}
      </div>

      <label htmlFor="ai-model" className="mt-3 block text-xs font-semibold text-bone/45">
        Model
      </label>
      {custom ? (
        <input
          id="ai-model"
          value={prefs.aiModel}
          onChange={(e) => setPrefs({ aiModel: e.target.value.trim() })}
          placeholder="model-id"
          spellCheck={false}
          className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 font-mono text-xs text-bone outline-none transition focus:border-white/30"
        />
      ) : (
        <select
          id="ai-model"
          value={prefs.aiModel}
          onChange={(e) => setPrefs({ aiModel: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm text-bone outline-none transition focus:border-white/30"
        >
          {families.map((family) => (
            <optgroup key={family} label={family}>
              {models
                .filter((m) => m.family === family)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={() => {
          const next = !custom;
          setCustom(next);
          if (!next) setPrefs({ aiModel: DEFAULT_MODEL[provider] });
        }}
        className="mt-1.5 text-xs font-semibold text-bone/40 transition hover:text-bone"
      >
        {custom ? "Pick from the list" : "Enter a model id by hand"}
      </button>

      {!custom && selected?.note && (
        <p className="mt-1.5 text-xs leading-relaxed text-bone/40">{selected.note}</p>
      )}
      {custom && (
        <p className="mt-1.5 text-xs leading-relaxed text-bone/40">
          Any id the provider serves. Unknown ids are called with the
          chat-completions shape, which most open models use.
        </p>
      )}

      <label htmlFor="ai-key" className="mt-3 block text-xs font-semibold text-bone/45">
        API key
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="ai-key"
          type={revealed ? "text" : "password"}
          value={prefs.aiApiKey}
          onChange={(e) => setPrefs({ aiApiKey: e.target.value.trim() })}
          placeholder={PROVIDERS[provider].keyPrefixHint}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 font-mono text-xs text-bone outline-none transition focus:border-white/30"
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="shrink-0 rounded-xl border border-white/12 px-3 text-xs font-semibold text-bone/60 transition hover:bg-white/10 hover:text-bone"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-bone/40">
        From {PROVIDERS[provider].keyHint}.
        {!prefs.aiApiKey && provider === "anthropic" && (
          <> Leave this blank to use the key set on the deployment, if there is one.</>
        )}
      </p>

      <p className="mt-3 border-t border-white/8 pt-3 text-xs leading-relaxed text-bone/35">
        The key is kept on this device and sent to this app&rsquo;s server on
        each reading, which forwards it once and never stores it. It has to go
        that way round because neither provider lets a browser call it
        directly. On a deployment you run, that is your own key on your own
        server; on somebody else&rsquo;s, you are trusting whoever runs it.
      </p>
    </div>
  );
}
