"use client";

import { FormEvent, useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";
import { DEFAULT_COMPLEX_MODEL, DEFAULT_SIMPLE_MODEL, VENICE_MODEL_OPTIONS } from "@/lib/venice";

export default function OnboardingPage() {
  const [result, setResult] = useState<string>("");
  const [modelOptions, setModelOptions] = useState<string[]>([...VENICE_MODEL_OPTIONS]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/models");
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModelOptions(data.models);
        }
      } catch {
        // Keep local fallback model list if the models endpoint fails.
      }
    })();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      goals: String(form.get("goals")).split(",").map((v) => v.trim()).filter(Boolean),
      interests: String(form.get("interests")).split(",").map((v) => v.trim()).filter(Boolean),
      level: form.get("level"),
      timezone: form.get("timezone"),
      coachStyle: form.get("coachStyle"),
      minutesPerDay: Number(form.get("minutesPerDay")),
      preferredSimpleModel: form.get("preferredSimpleModel"),
      preferredComplexModel: form.get("preferredComplexModel")
    };

    const response = await authedFetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      setResult(`Error: ${data.error ?? "Unable to save onboarding"}`);
      return;
    }

    setResult(`Onboarding saved:\n${JSON.stringify(data.profile, null, 2)}\n\nFirst-week plan:\n- ${data.firstWeekPlan.join("\n- ")}`);
  }

  return (
    <section>
      <h2>Onboarding (target: under 2 minutes)</h2>
      <form className="card" onSubmit={onSubmit}>
        <div className="row"><label>Goals</label><input name="goals" defaultValue="travel, work" /></div>
        <div className="row"><label>Interests</label><input name="interests" defaultValue="coffee, meetings" /></div>
        <div className="row"><label>Level</label><select name="level" defaultValue="beginner"><option>beginner</option><option>intermediate</option><option>advanced</option></select></div>
        <div className="row"><label>Timezone</label><input name="timezone" defaultValue="UTC" /></div>
        <div className="row"><label>Coach style</label><select name="coachStyle" defaultValue="friendly"><option>strict</option><option>friendly</option><option>playful</option><option>concise</option></select></div>
        <div className="row"><label>Minutes/day</label><input name="minutesPerDay" type="number" min={5} max={60} defaultValue={10} /></div>
        <div className="row">
          <label>Simple model</label>
          <select name="preferredSimpleModel" defaultValue={DEFAULT_SIMPLE_MODEL}>
            {modelOptions.map((model) => <option key={`simple-${model}`} value={model}>{model}</option>)}
          </select>
        </div>
        <div className="row">
          <label>Complex model</label>
          <select name="preferredComplexModel" defaultValue={DEFAULT_COMPLEX_MODEL}>
            {modelOptions.map((model) => <option key={`complex-${model}`} value={model}>{model}</option>)}
          </select>
        </div>
        <button type="submit">Save onboarding</button>
      </form>
      {result ? <pre className="card">{result}</pre> : null}
    </section>
  );
}
