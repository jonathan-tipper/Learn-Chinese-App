"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Settings2, Sparkles, Target, User } from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import { DEFAULT_COMPLEX_MODEL, DEFAULT_SIMPLE_MODEL, VENICE_MODEL_OPTIONS } from "@/lib/venice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "learning", label: "Learning", icon: Target },
  { id: "models", label: "Advanced", icon: Settings2 }
] as const;

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginner", desc: "Just starting out with Mandarin" },
  { value: "intermediate", label: "Intermediate", desc: "Can handle basic conversations" },
  { value: "advanced", label: "Advanced", desc: "Comfortable with complex topics" }
] as const;

const STYLE_OPTIONS = [
  { value: "friendly", label: "Friendly", desc: "Warm and encouraging" },
  { value: "strict", label: "Strict", desc: "High standards, direct feedback" },
  { value: "playful", label: "Playful", desc: "Fun, gamified learning" },
  { value: "concise", label: "Concise", desc: "Brief, to the point" }
] as const;

type FormData = {
  goals: string;
  interests: string;
  level: string;
  timezone: string;
  coachStyle: string;
  minutesPerDay: string;
  preferredSimpleModel: string;
  preferredComplexModel: string;
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ profile: unknown; firstWeekPlan: string[] } | null>(null);
  const [error, setError] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([...VENICE_MODEL_OPTIONS]);

  const [form, setForm] = useState<FormData>({
    goals: "travel, work",
    interests: "coffee, meetings",
    level: "beginner",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    coachStyle: "friendly",
    minutesPerDay: "10",
    preferredSimpleModel: DEFAULT_SIMPLE_MODEL,
    preferredComplexModel: DEFAULT_COMPLEX_MODEL
  });

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

  function updateForm(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const payload = {
      goals: form.goals.split(",").map((v) => v.trim()).filter(Boolean),
      interests: form.interests.split(",").map((v) => v.trim()).filter(Boolean),
      level: form.level,
      timezone: form.timezone,
      coachStyle: form.coachStyle,
      minutesPerDay: Number(form.minutesPerDay),
      preferredSimpleModel: form.preferredSimpleModel,
      preferredComplexModel: form.preferredComplexModel
    };

    const response = await authedFetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Unable to save onboarding");
      return;
    }

    setResult({ profile: data.profile, firstWeekPlan: data.firstWeekPlan });
  }

  if (result) {
    return (
      <div className="space-y-6 animate-fade-in max-w-xl mx-auto">
        <div className="flex flex-col items-center text-center space-y-3 py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-jade/10">
            <CheckCircle2 className="h-8 w-8 text-jade" />
          </div>
          <h1 className="text-2xl font-bold">You&apos;re all set!</h1>
          <p className="text-muted-foreground text-sm max-w-sm">
            Your profile has been saved. Here&apos;s your personalized first-week plan.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-jade" />
              First-week plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {Array.isArray(result.firstWeekPlan) && result.firstWeekPlan.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-medium mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Button onClick={() => setResult(null)} variant="outline" className="w-full">
          Edit profile
        </Button>
      </div>
    );
  }

  const progressPct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6 animate-fade-in max-w-xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Set up your profile</h1>
        <p className="text-sm text-muted-foreground">
          Takes under 2 minutes. We&apos;ll tailor everything to you.
        </p>
      </div>

      {/* Step progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {step + 1} of {STEPS.length}</span>
          <span>{STEPS[step].label}</span>
        </div>
        <Progress value={progressPct} className="h-1.5" />
        <div className="flex gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  i === step ? "text-foreground" : i < step ? "text-jade" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", i < step && "text-jade")} />
                {s.label}
                {i < STEPS.length - 1 && <span className="text-border ml-1">·</span>}
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Step 1: Profile */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About you</CardTitle>
              <CardDescription>Tell us about your goals and interests so the coach can personalize lessons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goals">Learning goals</Label>
                <Input
                  id="goals"
                  placeholder="travel, work, family, exams…"
                  value={form.goals}
                  onChange={(e) => updateForm("goals", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Comma-separated. These shape what topics the coach focuses on.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interests">Personal interests</Label>
                <Input
                  id="interests"
                  placeholder="coffee, tech, cooking, sports…"
                  value={form.interests}
                  onChange={(e) => updateForm("interests", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Your coach will weave these into examples and conversations.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Your timezone</Label>
                <Input
                  id="timezone"
                  placeholder="Asia/Shanghai"
                  value={form.timezone}
                  onChange={(e) => updateForm("timezone", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Learning preferences */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Learning preferences</CardTitle>
              <CardDescription>How you&apos;d like to learn and how much time you have.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Your Mandarin level</Label>
                <div className="grid grid-cols-1 gap-2">
                  {LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateForm("level", opt.value)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                        form.level === opt.value
                          ? "border-foreground bg-foreground/5"
                          : "border-border hover:border-foreground/40 hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        form.level === opt.value ? "border-foreground bg-foreground" : "border-muted-foreground/50"
                      )}>
                        {form.level === opt.value && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Coach personality</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateForm("coachStyle", opt.value)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                        form.coachStyle === opt.value
                          ? "border-foreground bg-foreground/5"
                          : "border-border hover:border-foreground/40 hover:bg-muted/50"
                      )}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minutes">Daily practice goal</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="minutes"
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={form.minutesPerDay}
                    onChange={(e) => updateForm("minutesPerDay", e.target.value)}
                    className="flex-1 accent-foreground"
                  />
                  <Badge variant="secondary" className="shrink-0 text-sm font-semibold min-w-[60px] justify-center">
                    {form.minutesPerDay} min
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Model preferences */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advanced settings</CardTitle>
              <CardDescription>Choose which AI models power your coach. Leave as-is if unsure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="simpleModel">Fast model</Label>
                <p className="text-xs text-muted-foreground">Used for quick questions and simple vocabulary lookups.</p>
                <Select
                  value={form.preferredSimpleModel}
                  onValueChange={(v) => updateForm("preferredSimpleModel", v)}
                >
                  <SelectTrigger id="simpleModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => (
                      <SelectItem key={`simple-${m}`} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="complexModel">Deep model</Label>
                <p className="text-xs text-muted-foreground">Used for grammar explanations, complex questions, and structured lessons.</p>
                <Select
                  value={form.preferredComplexModel}
                  onValueChange={(v) => updateForm("preferredComplexModel", v)}
                >
                  <SelectTrigger id="complexModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => (
                      <SelectItem key={`complex-${m}`} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <p className="text-xs bg-destructive/10 text-destructive rounded-md px-3 py-2">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} className="flex-1">
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save profile
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
