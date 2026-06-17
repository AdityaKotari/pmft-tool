"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepIdentity } from "@/components/onboarding/step-identity";
import { StepDateRange } from "@/components/onboarding/step-date-range";
import { StepProgress } from "@/components/onboarding/step-progress";

type Step = "identity" | "range" | "progress";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("identity");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rangePreset, setRangePreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [progress, setProgress] = useState<{
    current_date?: string;
    filings_seen?: number;
  }>({});
  const [error, setError] = useState("");
  const router = useRouter();

  // Redirect to dashboard if already set up
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.ready) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  // Compute fromDate from preset
  useEffect(() => {
    const days = { "7": 7, "30": 30, "90": 90 }[rangePreset as "7" | "30" | "90"];
    if (days !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      setFromDate(d.toISOString().split("T")[0]);
    }
  }, [rangePreset]);

  const startBackfill = async () => {
    setStep("progress");
    setError("");

    try {
      // Save identity
      const idRes = await fetch("/api/onboarding/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!idRes.ok) throw new Error("Failed to save identity");

      // Start backfill
      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(err.error || "Failed to start backfill");
        setStep("range");
        return;
      }

      // Listen to progress via SSE
      const eventSource = new EventSource("/api/backfill/progress");
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "progress") {
          setProgress(data);
        }
        if (data.type === "complete") {
          eventSource.close();
          router.push("/dashboard");
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        // Check if backfill finished
        fetch("/api/health")
          .then((r) => r.json())
          .then((h) => {
            if (h.ready) router.push("/dashboard");
          })
          .catch(() => {});
      };
    } catch (e) {
      setError(String(e));
      setStep("range");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 p-6">
        {step === "identity" && (
          <StepIdentity
            name={name}
            email={email}
            onNameChange={setName}
            onEmailChange={setEmail}
            onNext={() => setStep("range")}
          />
        )}
        {step === "range" && (
          <StepDateRange
            preset={rangePreset}
            from={fromDate}
            to={toDate}
            onPresetChange={setRangePreset}
            onFromChange={setFromDate}
            onToChange={setToDate}
            onBack={() => setStep("identity")}
            onStart={startBackfill}
            error={error}
          />
        )}
        {step === "progress" && (
          <StepProgress
            currentDate={progress.current_date}
            filingsSeen={progress.filings_seen}
            from={fromDate}
            to={toDate}
          />
        )}
      </div>
    </div>
  );
}
