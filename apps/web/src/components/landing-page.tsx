import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  FileText,
  LockKeyhole,
  Radar,
  Sparkles,
  Workflow
} from "lucide-react";

const liveServices = [
  {
    icon: Bot,
    title: "Agent workspace",
    description:
      "Chat, plan, inspect files, use tools, and keep execution transparent with approvals and run insight."
  },
  {
    icon: CalendarCheck2,
    title: "Meeting intelligence",
    description:
      "Capture transcripts or notes, generate minutes of meeting, extract action items, and prepare follow-up mail drafts."
  },
  {
    icon: BrainCircuit,
    title: "Free local brain path",
    description:
      "Run Ollama locally for drafting, summaries, and lightweight reasoning while keeping the architecture ready for a stronger knowledge layer."
  },
  {
    icon: LockKeyhole,
    title: "Secure connectors",
    description:
      "Manage Google Workspace access and connector state without exposing secrets back through the normal settings UI."
  }
] as const;

const howToUse = [
  {
    step: "01",
    title: "Start with a goal",
    description:
      "Open the workspace, describe the task in plain English, and let the assistant propose a plan before it acts."
  },
  {
    step: "02",
    title: "Feed work context",
    description:
      "Add meeting notes, documents, proposals, and policies so the system works from your real company context instead of generic answers."
  },
  {
    step: "03",
    title: "Review and approve",
    description:
      "Sensitive actions stay visible. The assistant can prepare drafts, plans, and workflow suggestions before execution."
  }
] as const;

const roadmap = [
  "Strong local open model via Ollama as the default free brain.",
  "Knowledge layer for PDFs, docs, meeting notes, manuals, and structured work data.",
  "Long-term memory for user context, company patterns, and recurring task preferences.",
  "Agent planning with tool execution, approvals, and reusable workflow templates.",
  "Small-model fine-tuning later on your own traces and outputs after the product stabilizes."
] as const;

const inProgress = [
  "True multi-user authentication and account onboarding.",
  "Deeper app connectors and travel-ticket booking workflows.",
  "Stronger knowledge ingestion and retrieval for document-grounded answers.",
  "More autonomous agent runs with trusted workflow presets and reusable playbooks."
] as const;

const previewCards = [
  {
    label: "Local routing",
    title: "Use free local models first",
    text: "Summaries, MoM drafts, and lower-cost orchestration can stay on-device through Ollama."
  },
  {
    label: "Meeting flow",
    title: "Turn notes into follow-ups",
    text: "Capture a transcript, generate minutes, draft the email, and keep attendees aligned."
  },
  {
    label: "Agent safety",
    title: "Visible approvals and trace",
    text: "Users can see what the system is planning, what tools it used, and what still needs approval."
  }
] as const;

export function LandingPage() {
  return (
    <div className="relative min-h-full overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_top,rgba(17,121,111,0.24),transparent_48%)]" />
      <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(217,119,6,0.2),transparent_62%)] blur-3xl" />

      <div className="relative flex min-h-full w-full flex-col gap-10">
        <header className="surface-panel sticky top-4 z-30 rounded-[2.2rem] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="surface-elevated flex h-12 w-12 items-center justify-center rounded-[1.3rem] bg-ink text-white shadow-sm">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-ink">TDAI Work Intelligence</p>
                <p className="text-sm text-ink/55">
                  Local-first assistant for planning, meetings, approvals, and connected work.
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-3 text-sm text-ink/65">
              <a href="#services" className="transition hover:text-ink">
                Services
              </a>
              <a href="#how-it-works" className="transition hover:text-ink">
                How it works
              </a>
              <a href="#roadmap" className="transition hover:text-ink">
                Roadmap
              </a>
              <Link href="/login" className="button-secondary px-4 py-2 text-sm font-medium">
                Login
              </Link>
              <Link href="/signup" className="button-primary px-4 py-2 text-sm font-medium">
                Sign up
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-14 pb-12">
          <section className="grid gap-10 border-b border-white/50 pb-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
            <div className="max-w-5xl pt-2">
              <div className="inline-flex items-center gap-2 rounded-full soft-chip px-4 py-2 text-sm font-medium text-signal">
                <Sparkles className="h-4 w-4" />
                Local-first AI workspace for real operational work
              </div>
              <h1 className="font-display mt-7 max-w-5xl text-4xl font-semibold leading-[1.02] text-ink sm:text-5xl lg:text-[5.1rem]">
                Build a work assistant that plans, remembers, and acts from your company context.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-ink/66 sm:text-lg">
                TDAI helps teams move from prompts to execution. Use the workspace to plan work,
                summarize meetings, draft follow-ups, inspect files, and manage approvals while we keep
                expanding the free local-brain architecture behind it.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/chat" className="button-primary text-sm font-semibold">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/meetings" className="button-secondary text-sm font-semibold">
                  Explore meeting studio
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-10 grid gap-6 border-y border-white/50 py-6 sm:grid-cols-3">
                <HeroStat value="Local-first" label="Private workspace design with visible approvals" />
                <HeroStat value="Free path" label="Ollama-ready architecture for zero-budget rollout" />
                <HeroStat value="Agentic" label="Plan-first execution instead of plain chat replies" />
              </div>
            </div>

            <div className="surface-panel halo-panel rounded-[3rem] p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-kicker">Inside the product</p>
                  <h2 className="font-display mt-3 text-3xl font-semibold text-ink">
                    One workspace, three strong AI flows.
                  </h2>
                </div>
                <div className="surface-elevated flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-ink text-white">
                  <Bot className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-8 space-y-5">
                {previewCards.map((card, index) => (
                  <div key={card.title}>
                    <div className="grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-start">
                      <p className="section-kicker pt-1">{card.label}</p>
                      <div>
                        <p className="font-display text-xl font-semibold text-ink">{card.title}</p>
                        <p className="mt-2 text-sm leading-7 text-ink/62">{card.text}</p>
                      </div>
                    </div>
                    {index < previewCards.length - 1 ? <div className="story-divider mt-5" /> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            id="services"
            className="grid gap-10 border-b border-white/50 pb-14 lg:grid-cols-[0.78fr_1.22fr]"
          >
            <div className="max-w-xl">
              <p className="section-kicker">What you can use now</p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                Product-led visibility instead of a blank chatbot screen.
              </h2>
              <p className="mt-5 text-sm leading-8 text-ink/62 sm:text-base">
                The homepage now introduces the product, shows what is live, and makes it easy to move
                into work. It should feel like an AI product site, not a demo made from stacked cards.
              </p>
            </div>

            <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {liveServices.map((service, index) => {
                const Icon = service.icon;
                return (
                  <div
                    key={service.title}
                    className={`pb-6 ${index < liveServices.length - 2 ? "border-b border-white/50 sm:pb-7" : ""}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="surface-muted flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-white/75 text-signal">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-semibold text-ink">{service.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-ink/62">{service.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="how-it-works" className="grid gap-12 border-b border-white/50 pb-14 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <p className="section-kicker">How to use it</p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                A simpler first-run journey with better visibility.
              </h2>
              <div className="mt-8 border-l border-ink/10 pl-5">
                <div className="space-y-8">
                  {howToUse.map((item) => (
                    <div key={item.step} className="relative">
                      <div className="absolute -left-[1.72rem] top-1 flex h-8 w-8 items-center justify-center rounded-full border border-signal/18 bg-white/90 text-xs font-semibold text-signal">
                        {item.step}
                      </div>
                      <h3 className="font-display text-xl font-semibold text-ink">{item.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-ink/62">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-10 lg:grid-cols-[0.98fr_1.02fr]">
              <div>
                <div className="flex items-center gap-3">
                  <div className="surface-elevated flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-ink text-white">
                    <Radar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">What we are actively building</p>
                    <p className="text-sm text-ink/58">Clear product visibility helps users trust what is ready.</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {inProgress.map((item) => (
                    <div key={item} className="flex items-start gap-3 border-b border-white/45 pb-4 text-sm leading-7 text-ink/64">
                      <Workflow className="mt-1 h-4 w-4 shrink-0 text-ember" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <div className="surface-muted flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-white/75 text-signal">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">Why this matters</p>
                    <p className="text-sm text-ink/58">
                      Accuracy is useful, but visibility, workflow fit, and context memory are what make the product sticky.
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <FeatureBullet text="Keeps approvals visible before sensitive actions." />
                  <FeatureBullet text="Stores meetings, sessions, run history, and reusable context." />
                  <FeatureBullet text="Gives teams a clear path from free local models to stronger domain intelligence." />
                </div>
              </div>
            </div>
          </section>

          <section id="roadmap" className="grid gap-12 border-b border-white/50 pb-14 lg:grid-cols-[0.84fr_1.16fr]">
            <div className="max-w-2xl">
              <p className="section-kicker">Free local-brain roadmap</p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                Best zero-budget direction: open local model plus your own work knowledge.
              </h2>
              <p className="mt-5 text-sm leading-8 text-ink/62 sm:text-base">
                This is the practical alternative to trying to build a ChatGPT-class model from scratch.
                We start free, build around real work data, and improve the product where it matters most.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/settings" className="button-primary text-sm font-semibold">
                  Configure the runtime
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/chat" className="button-secondary text-sm font-semibold">
                  Start with the workspace
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="surface-panel rounded-[2.8rem] p-6 sm:p-8">
              <div className="space-y-5">
                {roadmap.map((item, index) => (
                  <div
                    key={item}
                    className={`${index < roadmap.length - 1 ? "border-b border-white/50 pb-5" : ""}`}
                  >
                    <div className="grid gap-4 sm:grid-cols-[3.2rem_1fr] sm:items-start">
                      <div className="surface-elevated flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <p className="pt-1 text-sm leading-7 text-ink/68">{item}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="surface-panel rounded-[3rem] px-6 py-8 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="section-kicker">Ready to try it</p>
                <h2 className="font-display mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                  Use the product now, then keep evolving the brain behind it over time.
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup" className="button-primary text-sm font-semibold">
                  Create access preview
                </Link>
                <Link href="/chat" className="button-secondary text-sm font-semibold">
                  Go to workspace
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const HeroStat = ({ value, label }: { value: string; label: string }) => (
  <div>
    <p className="font-display text-xl font-semibold text-ink">{value}</p>
    <p className="mt-2 max-w-xs text-sm leading-6 text-ink/58">{label}</p>
  </div>
);

const FeatureBullet = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3 border-b border-white/45 pb-4">
    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-signal" />
    <p className="text-sm leading-7 text-ink/64">{text}</p>
  </div>
);
