"use client";

import { FormEvent, useState } from "react";

export default function OnboardingPage() {
  const [result, setResult] = useState<string>("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      goals: String(form.get("goals")).split(",").map((v) => v.trim()).filter(Boolean),
      interests: String(form.get("interests")).split(",").map((v) => v.trim()).filter(Boolean),
      level: form.get("level"),
      timezone: form.get("timezone"),
      coachStyle: form.get("coachStyle"),
      minutesPerDay: Number(form.get("minutesPerDay"))
    };

    const response = await fetch("/api/onboarding/save", {
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
        <button type="submit">Save onboarding</button>
      </form>
      {result ? <pre className="card">{result}</pre> : null}
    </section>
  );
}
