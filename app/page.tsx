"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileWarning,
  GitBranch,
  History,
  Loader2,
  Play,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TableProperties,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import type {
  ClarificationQuestion,
  FieldDefinition,
  FieldEvidence,
  FieldMapping,
  MappingRisk,
  PlanStatus,
  SourceRecord,
  TargetRecord,
  Transformation,
} from "@/lib/migration-engine";

type RunAction = "DRY_RUN" | "EXECUTE" | "RETRY" | "ROLLBACK";

interface Plan {
  id: string;
  datasetKey: string;
  name: string;
  version: number;
  status: PlanStatus;
  sourceSchema: FieldDefinition[];
  targetSchema: FieldDefinition[];
  sourceRecords: SourceRecord[];
  mappings: FieldMapping[];
  transformations: string[];
  risks: MappingRisk[];
  questions: ClarificationQuestion[];
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  mappingIssues: FieldEvidence[];
  predicted: {
    sourceCount: number;
    transformedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    warningCount: number;
  };
}

interface Run {
  id: string;
  planId: string;
  planVersion: number;
  action: RunAction;
  status: "COMPLETED" | "FAILED";
  sourceCount: number;
  transformedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  reconciliation: Record<string, unknown>;
  logs: Array<Record<string, unknown>>;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface Evidence {
  id: string;
  executionId: string;
  sourceKey: string;
  stage: string;
  outcome: "ACCEPTED" | "REJECTED" | "DUPLICATE";
  source: SourceRecord;
  transformed: TargetRecord;
  errors: FieldEvidence[];
  warnings: FieldEvidence[];
  createdAt: string;
}

interface Snapshot {
  generatedAt: string;
  workspace: {
    title: string;
    datasetName: string;
    maximumSampleSize: number;
    sampleSize: number;
    agentPolicy: string;
  };
  currentPlan: Plan;
  planVersions: Array<{
    id: string;
    version: number;
    status: PlanStatus;
    createdAt: string;
    approvedAt: string | null;
  }>;
  sourcePreview: SourceRecord[];
  targetCount: number;
  latestDryRun: Run | null;
  lastExecution: Run | null;
  runs: Run[];
  evidence: Evidence[];
  activities: Array<{
    id: string;
    planId: string;
    eventType: string;
    actor: string;
    summary: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  agentLogs: Array<{
    id: string;
    planId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    decision: string;
    createdAt: string;
  }>;
  supportedTransformations: Array<{
    value: Transformation;
    label: string;
    description: string;
  }>;
}

interface WebMCPContext {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: {
        readOnlyHint?: boolean;
        untrustedContentHint?: boolean;
      };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal }
  ) => void | Promise<void>;
}

declare global {
  interface Document {
    modelContext?: WebMCPContext;
  }
}

const NAV_ITEMS = [
  { value: "overview", label: "Overview", icon: Activity },
  { value: "plan", label: "Plan & mappings", icon: GitBranch },
  { value: "dry-run", label: "Dry run", icon: FileCheck2 },
  { value: "reconciliation", label: "Reconciliation", icon: ClipboardCheck },
  { value: "history", label: "History", icon: History },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sentenceCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusClass(status: PlanStatus | Evidence["outcome"] | RunAction): string {
  if (status === "APPROVED" || status === "ACCEPTED" || status === "EXECUTE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "EXECUTED" || status === "RETRY") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  if (status === "ROLLED_BACK" || status === "DUPLICATE") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "REJECTED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "DRY_RUN") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StatusBadge({ status }: { status: PlanStatus | Evidence["outcome"] | RunAction }) {
  return (
    <Badge className={"border font-semibold " + statusClass(status)} variant="outline">
      {sentenceCase(status)}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "indigo",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "indigo" | "emerald" | "rose" | "amber";
  icon: typeof Database;
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.035)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <span className={"flex size-9 items-center justify-center rounded-xl ring-1 " + tones[tone]}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function SectionHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        {detail ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

function EvidenceSummary({ evidence }: { evidence: Evidence[] }) {
  const accepted = evidence.filter((item) => item.outcome === "ACCEPTED").length;
  const rejected = evidence.filter((item) => item.outcome === "REJECTED").length;
  const duplicates = evidence.filter((item) => item.outcome === "DUPLICATE").length;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
        <p className="text-xs font-semibold text-emerald-700">Accepted</p>
        <p className="mt-1 text-2xl font-semibold text-emerald-900">{accepted}</p>
      </div>
      <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3">
        <p className="text-xs font-semibold text-rose-700">Quarantined</p>
        <p className="mt-1 text-2xl font-semibold text-rose-900">{rejected}</p>
      </div>
      <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
        <p className="text-xs font-semibold text-amber-700">Skipped as duplicate</p>
        <p className="mt-1 text-2xl font-semibold text-amber-900">{duplicates}</p>
      </div>
    </div>
  );
}

function BlankState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: typeof FileWarning;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function AppSkeleton() {
  return (
    <main className="min-h-screen bg-[#f6f8fc] px-4 py-6 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-16 rounded-2xl bg-slate-200" />
        <div className="mt-7 h-10 w-3/5 rounded-xl bg-slate-200" />
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 rounded-2xl bg-slate-200" />
          ))}
        </div>
        <div className="mt-5 h-80 rounded-2xl bg-slate-200" />
      </div>
    </main>
  );
}

export default function Home() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftMappings, setDraftMappings] = useState<FieldMapping[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workbench", { cache: "no-store" });
      const result = (await response.json()) as Snapshot & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load the migration workbench.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the migration workbench.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/workbench", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as Snapshot & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load the migration workbench.");
        return result;
      })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((initialLoadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            initialLoadError instanceof Error ? initialLoadError.message : "Unable to load the migration workbench.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const perform = useCallback(
    async (action: string, payload?: Record<string, unknown>): Promise<Snapshot> => {
      if (!data) throw new Error("The workspace is still loading.");
      setBusyAction(action);
      try {
        const response = await fetch("/api/workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, planId: data.currentPlan.id, payload }),
        });
        const result = (await response.json()) as {
          snapshot?: Snapshot;
          message?: string;
          error?: string;
        };
        if (!response.ok || !result.snapshot) {
          throw new Error(result.error ?? "The requested action could not be completed.");
        }
        setData(result.snapshot);
        toast.success(result.message ?? "Workspace updated.");
        return result.snapshot;
      } catch (actionError) {
        const message =
          actionError instanceof Error ? actionError.message : "The requested action could not be completed.";
        toast.error(message);
        throw actionError;
      } finally {
        setBusyAction(null);
      }
    },
    [data]
  );

  useEffect(() => {
    if (!data || !document.modelContext) return;
    const controller = new AbortController();
    const context = document.modelContext;

    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "read_migration_status",
            title: "Read migration status",
            description: "Read the current plan version, approval state, latest dry run, and target row count.",
            inputSchema: { type: "object", additionalProperties: false },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute: () => ({
              planVersion: data.currentPlan.version,
              planStatus: data.currentPlan.status,
              targetRows: data.targetCount,
              latestDryRun: data.latestDryRun
                ? {
                    accepted: data.latestDryRun.acceptedCount,
                    rejected: data.latestDryRun.rejectedCount,
                  }
                : null,
            }),
          },
          { signal: controller.signal }
        )
      ).catch(() => undefined);

      void Promise.resolve(
        context.registerTool(
          {
            name: "run_approved_migration_dry_run",
            title: "Run approved dry run",
            description: "Run the same deterministic no-write validation available in the visible workspace. It requires an approved plan.",
            inputSchema: { type: "object", additionalProperties: false },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async () => {
              const snapshot = await perform("dry_run");
              return {
                action: "dry_run",
                planStatus: snapshot.currentPlan.status,
                accepted: snapshot.latestDryRun?.acceptedCount ?? 0,
                rejected: snapshot.latestDryRun?.rejectedCount ?? 0,
                writes: 0,
              };
            },
          },
          { signal: controller.signal }
        )
      ).catch(() => undefined);
    } catch {
      return () => controller.abort();
    }

    return () => controller.abort();
  }, [data, perform]);

  const plan = data?.currentPlan;
  const latestRun = data?.lastExecution ?? data?.latestDryRun ?? null;
  const canApprove = plan?.status === "REVIEW_REQUIRED";
  const canRun = plan?.status === "APPROVED" || plan?.status === "EXECUTED";
  const canRollback = plan?.status === "EXECUTED";

  const executionLabel = plan?.status === "EXECUTED" ? "Retry safely" : "Execute migration";
  const executionIcon = plan?.status === "EXECUTED" ? RefreshCcw : Play;
  const ExecutionIcon = executionIcon;

  const openEditor = () => {
    if (!plan) return;
    setDraftMappings(plan.mappings.map((mapping) => ({ ...mapping })));
    setEditorOpen(true);
  };

  const updateMapping = (index: number, patch: Partial<FieldMapping>) => {
    setDraftMappings((current) =>
      current.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...patch } : mapping
      )
    );
  };

  const reconciliation = latestRun?.reconciliation ?? {};
  const expectedTargetAfter = Number(reconciliation.expectedTargetAfter ?? data?.targetCount ?? 0);
  const variance = Number(reconciliation.variance ?? 0);

  const mappingHealth = useMemo(() => {
    if (!plan) return { mapped: 0, required: 0, ready: false };
    const required = plan.targetSchema.filter((field) => field.required).length;
    return {
      mapped: plan.mappings.length,
      required,
      ready: plan.mappingIssues.length === 0,
    };
  }, [plan]);

  if (loading) return <AppSkeleton />;

  if (error || !data || !plan) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fc] px-5">
        <section className="max-w-lg rounded-3xl border border-rose-100 bg-white p-7 text-center shadow-xl shadow-slate-950/5">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <CircleAlert className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-950">The workbench could not start</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error ?? "No migration data is available."}</p>
          <Button className="mt-5 bg-slate-950 hover:bg-slate-800" onClick={() => void load()}>
            Try again
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc] text-slate-900">
      <Toaster position="top-right" richColors />
      <header className="border-b border-slate-800 bg-[#0c1324] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-500/20">
              <Boxes className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight">Migration Control</p>
              <p className="text-xs text-slate-400">Bounded planning and reconciliation workbench</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200" variant="outline">
              <Database className="size-3.5" />
              Mock target · {data.targetCount} rows
            </Badge>
            <Badge className="border-indigo-400/25 bg-indigo-400/10 px-2.5 py-1 text-indigo-200" variant="outline">
              <ShieldCheck className="size-3.5" />
              Approval gate enabled
            </Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-8 sm:py-9">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700" variant="outline">
                  Customer data migration
                </Badge>
                <span className="text-sm font-medium text-slate-400">Plan v{plan.version}</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                {data.workspace.datasetName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Review an agent proposal, approve it, validate the exact records, and safely write to a mock target with full rollback history.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:min-w-56">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current gate</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={plan.status} />
                <span className="text-sm font-medium text-slate-700">
                  {plan.status === "REVIEW_REQUIRED"
                    ? "Human review needed"
                    : plan.status === "APPROVED"
                      ? "Ready for validation"
                      : plan.status === "EXECUTED"
                        ? "Target write complete"
                        : "Target rows removed"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <Button
              variant="outline"
              className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              onClick={() => void perform("run_agent")}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "run_agent" ? <Loader2 className="animate-spin" /> : <WandSparkles />}
              Refresh agent proposal
            </Button>
            <Button
              className="bg-slate-950 hover:bg-slate-800"
              onClick={() => void perform("approve_plan")}
              disabled={!canApprove || Boolean(busyAction)}
            >
              {busyAction === "approve_plan" ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
              Approve plan
            </Button>
            <Button
              variant="outline"
              onClick={() => void perform("dry_run")}
              disabled={!canRun || Boolean(busyAction)}
            >
              {busyAction === "dry_run" ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
              Run dry run
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => void perform("execute")}
              disabled={!canRun || Boolean(busyAction)}
            >
              {busyAction === "execute" ? <Loader2 className="animate-spin" /> : <ExecutionIcon />}
              {executionLabel}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  disabled={!canRollback || Boolean(busyAction)}
                >
                  <RotateCcw />
                  Roll back migration
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Roll back this mock migration?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes only the target rows created by plan v{plan.version}. The source data, plan, dry-run evidence, and audit history remain available.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep target rows</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void perform("rollback")}
                    disabled={!canRollback || Boolean(busyAction)}
                  >
                    {busyAction === "rollback" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    Roll back migration
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-7 gap-5">
          <TabsList
            variant="line"
            className="w-full justify-start gap-1 overflow-x-auto border-b border-slate-200 bg-transparent p-0"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="shrink-0 rounded-t-lg px-3 py-2.5 text-slate-500 data-[state=active]:text-indigo-700 after:bg-indigo-600"
                >
                  <Icon className="size-4" />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Source records"
                value={plan.predicted.sourceCount}
                detail={"Bounded demo dataset · max " + data.workspace.maximumSampleSize}
                icon={Database}
              />
              <MetricCard
                label="Valid after transform"
                value={plan.predicted.acceptedCount}
                detail="Deterministic transformations and validations passed"
                tone="emerald"
                icon={Check}
              />
              <MetricCard
                label="Quarantined"
                value={plan.predicted.rejectedCount}
                detail="Field-level error evidence is preserved"
                tone="rose"
                icon={FileWarning}
              />
              <MetricCard
                label="Target rows"
                value={data.targetCount}
                detail="Idempotent writes into the mock AsterCRM target"
                tone="amber"
                icon={TableProperties}
              />
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
              <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
                <div className="border-b border-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-5 text-white sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-200">Primary workflow</p>
                      <h2 className="mt-1 text-xl font-semibold">Review before every write</h2>
                    </div>
                    <StatusBadge status={plan.status} />
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-4">
                    {[
                      { label: "Proposal", done: true },
                      { label: "Human approval", done: plan.status !== "REVIEW_REQUIRED" },
                      { label: "Dry run", done: Boolean(data.latestDryRun) },
                      { label: "Mock migration", done: plan.status === "EXECUTED" || plan.status === "ROLLED_BACK" },
                    ].map((stage, index) => (
                      <div key={stage.label} className="flex items-center gap-2 text-xs font-medium text-slate-300">
                        <span
                          className={
                            "grid size-5 place-items-center rounded-full text-[10px] " +
                            (stage.done ? "bg-emerald-400 text-emerald-950" : "bg-white/10 text-slate-300")
                          }
                        >
                          {stage.done ? <Check className="size-3" /> : index + 1}
                        </span>
                        {stage.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <Bot className="size-4 text-indigo-600" />
                      <h3 className="mt-3 text-sm font-semibold text-slate-900">Tool-bounded agent</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-500">Inspects only supplied schemas, sample records, and validation results.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <ShieldCheck className="size-4 text-emerald-600" />
                      <h3 className="mt-3 text-sm font-semibold text-slate-900">Approval gate</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-500">No dry run or target write can happen until a reviewer approves.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <RefreshCcw className="size-4 text-amber-600" />
                      <h3 className="mt-3 text-sm font-semibold text-slate-900">Retry safe</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-500">Unique source IDs prevent duplicate target inserts during a retry.</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-indigo-950">Ready-to-review mapping package</p>
                        <p className="mt-1 text-sm text-indigo-800">
                          {mappingHealth.mapped} mappings cover {mappingHealth.required} required target fields.
                          {mappingHealth.ready ? " Validation is clear." : " Mapping issues need attention."}
                        </p>
                      </div>
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setActiveTab("plan")}>
                        Review plan
                        <ChevronRight />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>

              <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Latest signal</p>
                {latestRun ? (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <StatusBadge status={latestRun.action} />
                      <span className="text-sm text-slate-500">{formatDate(latestRun.completedAt)}</span>
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-slate-950">
                      {latestRun.action === "DRY_RUN"
                        ? "Validation evidence ready"
                        : latestRun.action === "ROLLBACK"
                          ? "Target write reversed"
                          : "Reconciliation recorded"}
                    </h2>
                    <dl className="mt-5 space-y-3 text-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <dt className="text-slate-500">Accepted</dt>
                        <dd className="font-semibold text-emerald-700">{latestRun.acceptedCount}</dd>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <dt className="text-slate-500">Quarantined</dt>
                        <dd className="font-semibold text-rose-700">{latestRun.rejectedCount}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Duplicate skips</dt>
                        <dd className="font-semibold text-amber-700">{latestRun.duplicateCount}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <BlankState
                    icon={Activity}
                    title="No run evidence yet"
                    detail="Approve the plan, then run a no-write dry run to see field-level validation evidence."
                    action={
                      <Button size="sm" className="bg-slate-950 hover:bg-slate-800" onClick={() => void perform("approve_plan")} disabled={!canApprove}>
                        Approve plan
                      </Button>
                    }
                  />
                )}
              </aside>
            </section>
          </TabsContent>

          <TabsContent value="plan" className="mt-0 space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeader
                eyebrow="Agent proposal"
                title={"Plan v" + plan.version + " · " + plan.mappings.length + " field mappings"}
                detail={data.workspace.agentPolicy}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void perform("run_agent")}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === "run_agent" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      Re-run agent
                    </Button>
                    <Button size="sm" className="bg-slate-950 hover:bg-slate-800" onClick={openEditor}>
                      <GitBranch />
                      Edit mappings
                    </Button>
                  </div>
                }
              />

              {plan.mappingIssues.length ? (
                <div className="mt-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" />
                  <div>
                    <p className="font-semibold text-rose-900">Plan has validation issues</p>
                    <p className="mt-1 text-sm leading-6 text-rose-800">
                      {plan.mappingIssues.map((issue) => issue.message).join(" ")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-emerald-900">Mapping structure is valid</p>
                    <p className="mt-1 text-sm leading-6 text-emerald-800">
                      Required target fields are covered once each. Record-level errors will still be isolated during dry run.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="pl-4">Source field</TableHead>
                      <TableHead>Target field</TableHead>
                      <TableHead>Transformation</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead className="pr-4">Reasoning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.mappings.map((mapping) => (
                      <TableRow key={mapping.targetField}>
                        <TableCell className="pl-4 font-mono text-xs text-slate-700">{mapping.sourceField}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ArrowRight className="size-3.5 text-slate-400" />
                            <code className="text-xs text-slate-700">{mapping.targetField}</code>
                            {mapping.required ? <span className="text-[11px] font-medium text-rose-500">required</span> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            {data.supportedTransformations.find((item) => item.value === mapping.transformation)?.label ??
                              sentenceCase(mapping.transformation)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              "capitalize " +
                              (mapping.confidence === "high"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : mapping.confidence === "medium"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700")
                            }
                          >
                            {mapping.confidence}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-sm whitespace-normal pr-4 text-sm leading-5 text-slate-500">
                          {mapping.rationale}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
                <SectionHeader
                  eyebrow="Mapping risks"
                  title="Items requiring a deliberate decision"
                  detail="The agent highlights risks instead of silently choosing an unsafe transformation."
                />
                <div className="mt-5 space-y-3">
                  {plan.risks.map((risk) => (
                    <div key={risk.title} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            risk.severity === "high"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : risk.severity === "medium"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                          }
                        >
                          {risk.severity}
                        </Badge>
                        <h3 className="font-semibold text-slate-900">{risk.title}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{risk.detail}</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-800">Safe handling: {risk.resolution}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
                <SectionHeader
                  eyebrow="Clarifications"
                  title="Questions before a production rule"
                  detail="These questions are intentionally not auto-resolved by the agent."
                />
                <div className="mt-5 space-y-3">
                  {plan.questions.map((question, index) => (
                    <div key={question.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                      <div className="flex gap-3">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-indigo-600 shadow-sm ring-1 ring-slate-200">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-semibold leading-6 text-slate-900">{question.question}</p>
                          <p className="mt-1 text-sm leading-5 text-slate-500">{question.whyItMatters}</p>
                          <p className="mt-2 text-sm font-medium leading-5 text-indigo-700">Safe default: {question.safeDefault}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </TabsContent>

          <TabsContent value="dry-run" className="mt-0 space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeader
                eyebrow="Deterministic validation"
                title="Dry run evidence"
                detail="Every source record is transformed using the approved mappings. This step never writes to the mock target."
                action={
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => void perform("dry_run")}
                    disabled={!canRun || Boolean(busyAction)}
                  >
                    {busyAction === "dry_run" ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
                    Run dry run
                  </Button>
                }
              />

              {data.latestDryRun ? (
                <>
                  <div className="mt-5">
                    <EvidenceSummary evidence={data.evidence} />
                  </div>
                  <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <FileCheck2 className="mt-0.5 size-5 text-sky-600" />
                        <div>
                          <p className="font-semibold text-sky-950">No-write validation complete</p>
                          <p className="mt-1 text-sm text-sky-800">
                            {data.latestDryRun.transformedCount} records transformed at {formatDate(data.latestDryRun.completedAt)}. The mock target remains unchanged.
                          </p>
                        </div>
                      </div>
                      <StatusBadge status="DRY_RUN" />
                    </div>
                  </div>
                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="pl-4">Source ID</TableHead>
                          <TableHead>Outcome</TableHead>
                          <TableHead>Transformed preview</TableHead>
                          <TableHead className="pr-4">Field-level evidence</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.evidence.map((record) => {
                          const evidence = [...record.errors, ...record.warnings];
                          return (
                            <TableRow key={record.id}>
                              <TableCell className="pl-4 font-mono text-xs font-medium text-slate-700">{record.sourceKey}</TableCell>
                              <TableCell>
                                <StatusBadge status={record.outcome} />
                              </TableCell>
                              <TableCell className="max-w-xs whitespace-normal">
                                <p className="font-medium text-slate-800">{record.transformed.full_name ?? "—"}</p>
                                <p className="mt-1 font-mono text-xs text-slate-500">
                                  {record.transformed.email ?? "No normalized email"}
                                </p>
                              </TableCell>
                              <TableCell className="max-w-md whitespace-normal pr-4 text-sm leading-5 text-slate-600">
                                {evidence.length ? (
                                  <ul className="space-y-1">
                                    {evidence.slice(0, 2).map((item) => (
                                      <li key={item.code} className="flex gap-1.5">
                                        <span className={item.code.includes("UNNORMALIZED") ? "text-amber-600" : "text-rose-600"}>•</span>
                                        <span>{item.message}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-emerald-700">Validated with no field errors</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="mt-5">
                  <BlankState
                    icon={FileCheck2}
                    title={canRun ? "Ready for a no-write check" : "Approval is required first"}
                    detail={
                      canRun
                        ? "Run the deterministic dry run to validate all sample records and create evidence before the target write."
                        : "The plan is not approved yet, so the workbench keeps both dry run and execution locked."
                    }
                    action={
                      canRun ? (
                        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => void perform("dry_run")}>
                          <FileCheck2 />
                          Run dry run
                        </Button>
                      ) : (
                        <Button className="bg-slate-950 hover:bg-slate-800" onClick={() => void perform("approve_plan")} disabled={!canApprove}>
                          <BadgeCheck />
                          Approve plan
                        </Button>
                      )
                    }
                  />
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-0 space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeader
                eyebrow="Reconciliation"
                title="Source-to-target control total"
                detail="The workbench compares the result of each run against the mock target and records any variance."
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => void perform("execute")}
                      disabled={!canRun || Boolean(busyAction)}
                    >
                      {busyAction === "execute" ? <Loader2 className="animate-spin" /> : <ExecutionIcon />}
                      {executionLabel}
                    </Button>
                  </div>
                }
              />

              {data.lastExecution ? (
                <>
                  <div className="mt-7 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Source</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-950">{data.lastExecution.sourceCount}</p>
                      <p className="mt-1 text-sm text-slate-500">records inspected</p>
                    </div>
                    <ArrowRight className="m-auto size-5 text-slate-300" />
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Inserted</p>
                      <p className="mt-2 text-3xl font-semibold text-emerald-950">{data.lastExecution.acceptedCount}</p>
                      <p className="mt-1 text-sm text-emerald-700">new target records</p>
                    </div>
                    <ArrowRight className="m-auto size-5 text-slate-300" />
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-700">Mock target</p>
                      <p className="mt-2 text-3xl font-semibold text-indigo-950">{data.targetCount}</p>
                      <p className="mt-1 text-sm text-indigo-700">rows after latest action</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-900">Quarantined</p>
                      <p className="mt-2 text-2xl font-semibold text-rose-600">{data.lastExecution.rejectedCount}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">Invalid source records remain out of the target.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-900">Retry duplicates</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-600">{data.lastExecution.duplicateCount}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">Existing target IDs were safely skipped.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-900">Control-total variance</p>
                      <p className={"mt-2 text-2xl font-semibold " + (variance === 0 ? "text-emerald-600" : "text-rose-600")}>
                        {variance === 0 ? "0" : variance > 0 ? "+" + variance : variance}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        Expected target total: {expectedTargetAfter}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="pl-4">Run</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Inserted</TableHead>
                          <TableHead>Rejected</TableHead>
                          <TableHead>Duplicate skips</TableHead>
                          <TableHead className="pr-4">Completed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.runs.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="pl-4 font-mono text-xs text-slate-600">#{run.id.slice(0, 8)}</TableCell>
                            <TableCell><StatusBadge status={run.action} /></TableCell>
                            <TableCell className="font-medium text-emerald-700">{run.acceptedCount}</TableCell>
                            <TableCell className="font-medium text-rose-700">{run.rejectedCount}</TableCell>
                            <TableCell className="font-medium text-amber-700">{run.duplicateCount}</TableCell>
                            <TableCell className="pr-4 text-sm text-slate-500">{formatDate(run.completedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="mt-5">
                  <BlankState
                    icon={ClipboardCheck}
                    title="No target migration has run"
                    detail="After an approved dry run, execute the mock migration to see deterministic deduplication and source-to-target reconciliation."
                    action={
                      <Button
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => void perform("execute")}
                        disabled={!canRun}
                      >
                        <ExecutionIcon />
                        {executionLabel}
                      </Button>
                    }
                  />
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="history" className="mt-0 space-y-5">
            <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
                <SectionHeader
                  eyebrow="Plan versions"
                  title="Decision history"
                  detail="Edits and agent proposals create a new review-required version rather than overwriting the prior plan."
                />
                <div className="mt-5 space-y-3">
                  {data.planVersions.map((version) => (
                    <div
                      key={version.id}
                      className={
                        "flex items-center justify-between rounded-2xl border p-4 " +
                        (version.id === plan.id ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-xl bg-white text-sm font-bold text-indigo-600 shadow-sm ring-1 ring-slate-200">
                          v{version.version}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">{version.id === plan.id ? "Current plan" : "Historical plan"}</p>
                          <p className="mt-0.5 text-xs text-slate-500">Created {formatDate(version.createdAt)}</p>
                        </div>
                      </div>
                      <StatusBadge status={version.status} />
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
                <SectionHeader
                  eyebrow="Audit trail"
                  title="Application and agent events"
                  detail="All important planning and execution actions are retained as structured entries."
                />
                <div className="mt-5 divide-y divide-slate-100">
                  {data.activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 py-4 first:pt-0">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                        <History className="size-4" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{sentenceCase(activity.eventType)}</p>
                          <span className="text-xs text-slate-400">{formatDate(activity.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{activity.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeader
                eyebrow="AI workflow log"
                title="Tool use behind the proposal"
                detail="The agent records every inspection and validation decision. It has no execution permission."
              />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {data.agentLogs.map((log) => (
                  <article key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Bot className="size-4 text-indigo-600" />
                        <code className="text-xs font-semibold text-slate-700">{log.toolName}</code>
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{log.decision}</p>
                    <p className="mt-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] leading-5 text-slate-500">
                      output: {JSON.stringify(log.output)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>

        <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Bounded demo: one LegacyCRM source, one AsterCRM mock target, maximum {data.workspace.maximumSampleSize} sample records.</p>
          <p>Last refreshed {formatDate(data.generatedAt)}</p>
        </footer>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-slate-200 bg-white p-0">
          <DialogHeader className="border-b border-slate-100 px-6 pb-5 pt-6">
            <DialogTitle>Edit mapping plan</DialogTitle>
            <DialogDescription>
              Saving creates a new version and removes its approval. The target write stays locked until the revised plan is approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6 py-5">
            {draftMappings.map((mapping, index) => (
              <div key={mapping.targetField + index} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1fr_auto_1fr_1.1fr] md:items-center">
                <Select
                  value={mapping.sourceField}
                  onValueChange={(value) => updateMapping(index, { sourceField: value })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plan.sourceSchema.map((field) => (
                      <SelectItem key={field.name} value={field.name}>{field.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ArrowRight className="mx-auto size-4 text-slate-400" />
                <Select
                  value={mapping.targetField}
                  onValueChange={(value) => updateMapping(index, { targetField: value as FieldMapping["targetField"] })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plan.targetSchema.map((field) => (
                      <SelectItem key={field.name} value={field.name}>{field.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={mapping.transformation}
                  onValueChange={(value) => updateMapping(index, { transformation: value as Transformation })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.supportedTransformations.map((transformation) => (
                      <SelectItem key={transformation.value} value={transformation.value}>
                        {transformation.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter className="border-t border-slate-100 px-6 py-5">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button
              className="bg-slate-950 hover:bg-slate-800"
              disabled={busyAction === "save_mappings"}
              onClick={() => {
                void perform("save_mappings", { mappings: draftMappings })
                  .then(() => setEditorOpen(false))
                  .catch(() => undefined);
              }}
            >
              {busyAction === "save_mappings" ? <Loader2 className="animate-spin" /> : <GitBranch />}
              Save new plan version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
