"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  HandCoins,
  Home,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Share2,
  Smartphone,
  Trash2,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { Toaster } from "@/components/ui/sonner";

type View = "home" | "sale" | "movement" | "close";
type PaymentMethod = "cash" | "card" | "transfer";
type MovementKind = "sale" | "provider" | "entry" | "withdrawal" | "expense";
type ShiftStatus = "open" | "closed";

type Movement = {
  id: string;
  kind: MovementKind;
  amount: number;
  note: string;
  party: string;
  paymentMethod: PaymentMethod;
  affectsCash: boolean;
  createdAt: string;
};

type Shift = {
  id: string;
  openedAt: string;
  base: number;
  status: ShiftStatus;
  movements: Movement[];
  closedAt?: string;
  countedCash?: number;
};

type ModelTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const STORAGE_KEY = "minicaja:current-shift:v1";
const paymentLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};
const kindLabels: Record<MovementKind, string> = {
  sale: "Venta",
  provider: "Proveedor",
  entry: "Entrada",
  withdrawal: "Retiro",
  expense: "Gasto",
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeNumber(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

function summarize(shift: Shift) {
  const sales = { cash: 0, card: 0, transfer: 0 };
  let providerTotal = 0;
  let providerCash = 0;
  let entries = 0;
  let withdrawals = 0;
  let expenses = 0;
  let otherCashNet = 0;

  shift.movements.forEach((movement) => {
    if (movement.kind === "sale") sales[movement.paymentMethod] += movement.amount;
    if (movement.kind === "provider") {
      providerTotal += movement.amount;
      if (movement.affectsCash) providerCash += movement.amount;
    }
    if (movement.kind === "entry") {
      entries += movement.amount;
      if (movement.affectsCash) otherCashNet += movement.amount;
    }
    if (movement.kind === "withdrawal") {
      withdrawals += movement.amount;
      if (movement.affectsCash) otherCashNet -= movement.amount;
    }
    if (movement.kind === "expense") {
      expenses += movement.amount;
      if (movement.affectsCash) otherCashNet -= movement.amount;
    }
  });

  const salesTotal = sales.cash + sales.card + sales.transfer;
  const expectedCash = shift.base + sales.cash - providerCash + otherCashNet;
  const difference = shift.countedCash == null ? null : shift.countedCash - expectedCash;
  return { sales, salesTotal, providerTotal, providerCash, entries, withdrawals, expenses, otherCashNet, expectedCash, difference };
}

function ascii(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createPdf(shift: Shift) {
  const summary = summarize(shift);
  const opened = new Date(shift.openedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  const lines = [
    "CORTE DE CAJA",
    `Turno: ${opened}`,
    "",
    `Base inicial: ${money.format(shift.base)}`,
    `Ventas totales: ${money.format(summary.salesTotal)}`,
    `  Efectivo: ${money.format(summary.sales.cash)}`,
    `  Tarjeta: ${money.format(summary.sales.card)}`,
    `  Transferencia: ${money.format(summary.sales.transfer)}`,
    `Pagos a proveedores: ${money.format(summary.providerTotal)}`,
    `  Salida de caja: ${money.format(summary.providerCash)}`,
    `Entradas extra: ${money.format(summary.entries)}`,
    `Retiros: ${money.format(summary.withdrawals)}`,
    `Gastos: ${money.format(summary.expenses)}`,
    "",
    `Efectivo esperado: ${money.format(summary.expectedCash)}`,
    `Efectivo contado: ${money.format(shift.countedCash ?? 0)}`,
    `Diferencia: ${money.format(summary.difference ?? 0)}`,
    "",
    "MOVIMIENTOS",
    ...shift.movements.map((movement) => {
      const time = new Date(movement.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      const name = movement.party || movement.note || kindLabels[movement.kind];
      return `${time}  ${kindLabels[movement.kind]} - ${name} - ${paymentLabels[movement.paymentMethod]} - ${money.format(movement.amount)}`;
    }),
    "",
    "Generado con MiniCaja",
  ];

  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 43) pages.push(lines.slice(index, index + 43));
  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  const fontObject = 3 + pages.length * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const body = page.map((line, lineIndex) => lineIndex === 0 ? `/F1 17 Tf (${ascii(line).slice(0, 95)}) Tj /F1 10 Tf 0 -28 Td` : `(${ascii(line).slice(0, 95)}) Tj T*`).join("\n");
    const stream = `BT 50 748 Td 14 TL\n${body}\nET`;
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontObject] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadBlob(blob: Blob, fileName: string, open = false) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (open) window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function methodIcon(method: PaymentMethod) {
  if (method === "cash") return Banknote;
  if (method === "card") return CreditCard;
  return Smartphone;
}

function movementIcon(kind: MovementKind) {
  if (kind === "sale") return ArrowDownLeft;
  if (kind === "provider") return Building2;
  if (kind === "entry") return Plus;
  if (kind === "withdrawal") return ArrowUpRight;
  return ReceiptText;
}

function isPositive(kind: MovementKind) {
  return kind === "sale" || kind === "entry";
}

export default function HomePage() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("home");
  const [editing, setEditing] = useState<Movement | null>(null);
  const shiftRef = useRef<Shift | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setShift(JSON.parse(saved) as Shift);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    shiftRef.current = shift;
    if (!hydrated) return;
    if (shift) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shift));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [hydrated, shift]);

  const summary = useMemo(() => (shift ? summarize(shift) : null), [shift]);

  function openShift(base: number) {
    setShift({ id: createId(), openedAt: new Date().toISOString(), base, status: "open", movements: [] });
    setView("home");
    toast.success("Turno abierto");
  }

  function saveMovement(movement: Omit<Movement, "id" | "createdAt">, id?: string) {
    setShift((current) => {
      if (!current || current.status !== "open") return current;
      if (id) return { ...current, movements: current.movements.map((item) => item.id === id ? { ...item, ...movement } : item) };
      return { ...current, movements: [...current.movements, { ...movement, id: createId(), createdAt: new Date().toISOString() }] };
    });
    setEditing(null);
    setView("home");
    toast.success(id ? "Movimiento actualizado" : "Movimiento guardado");
  }

  function removeMovement(id: string) {
    setShift((current) => current ? { ...current, movements: current.movements.filter((movement) => movement.id !== id) } : current);
    setEditing(null);
    setView("home");
    toast.success("Movimiento eliminado");
  }

  function goTo(target: View, movement?: Movement) {
    setEditing(movement ?? null);
    setView(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editMovement(movement: Movement) {
    goTo(movement.kind === "sale" ? "sale" : "movement", movement);
  }

  function closeShift(countedCash: number) {
    setShift((current) => current ? { ...current, countedCash, closedAt: new Date().toISOString(), status: "closed" } : current);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    toast.success("Corte listo para compartir");
  }

  useEffect(() => {
    if (!hydrated || !document.modelContext?.registerTool) return;
    const controller = new AbortController();
    const context = document.modelContext;
    const report = () => undefined;
    const register = (tool: ModelTool) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(report); } catch { report(); }
    };
    register({
      name: "read_current_shift",
      title: "Consultar turno actual",
      description: "Lee el resumen actual de MiniCaja sin modificar el turno.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const current = shiftRef.current;
        if (!current) return { status: "no_shift" };
        return { status: current.status, openedAt: current.openedAt, base: current.base, ...summarize(current) };
      },
    });
    register({
      name: "add_sale",
      title: "Registrar venta",
      description: "Registra una venta en el turno abierto con monto, concepto y método de pago.",
      inputSchema: {
        type: "object",
        properties: { amount: { type: "number", exclusiveMinimum: 0 }, concept: { type: "string" }, paymentMethod: { type: "string", enum: ["cash", "card", "transfer"] } },
        required: ["amount", "paymentMethod"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const data = input as { amount?: number; concept?: string; paymentMethod?: PaymentMethod };
        const current = shiftRef.current;
        if (!current || current.status !== "open") throw new Error("No hay un turno abierto.");
        if (!data.amount || data.amount <= 0 || !data.paymentMethod || !paymentLabels[data.paymentMethod]) throw new Error("Monto o método de pago inválido.");
        const movement: Movement = { id: createId(), kind: "sale", amount: safeNumber(data.amount), note: String(data.concept ?? ""), party: "", paymentMethod: data.paymentMethod, affectsCash: data.paymentMethod === "cash", createdAt: new Date().toISOString() };
        const next = { ...current, movements: [...current.movements, movement] };
        setShift(next);
        return { id: movement.id, saved: true, expectedCash: summarize(next).expectedCash };
      },
    });
    return () => controller.abort();
  }, [hydrated]);

  if (!hydrated) return <main className="loading-screen" aria-label="Cargando MiniCaja"><span className="brand-mark"><ReceiptText /></span><strong>MiniCaja</strong></main>;
  if (!shift) return <OpenShift onOpen={openShift} />;
  const fileName = `MiniCaja-${new Date(shift.openedAt).toISOString().slice(0, 10)}.pdf`;

  async function sharePdf() {
    const current = shiftRef.current;
    if (!current || current.status !== "closed") return;
    const blob = createPdf(current);
    const file = new File([blob], fileName, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    try {
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ title: "Corte de MiniCaja", text: "Te comparto el corte de caja del turno.", files: [file] });
        toast.success("Corte compartido");
      } else {
        downloadBlob(blob, fileName, true);
        toast.info("PDF descargado. Ya puedes enviarlo por WhatsApp.");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        downloadBlob(blob, fileName, true);
        toast.info("PDF descargado. Ya puedes enviarlo por WhatsApp.");
      }
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => goTo("home")} aria-label="Ir al inicio">
          <span className="brand-mark"><ReceiptText /></span>
          <span><strong>MiniCaja</strong><small>Turno de hoy</small></span>
        </button>
        <span className={`status-pill ${shift.status}`}><span />{shift.status === "open" ? "Turno abierto" : "Turno cerrado"}</span>
      </header>
      <div className="workspace">
        {view === "home" && summary && <Dashboard shift={shift} summary={summary} onNavigate={goTo} onEdit={editMovement} onShare={sharePdf} onDownload={() => downloadBlob(createPdf(shift), fileName)} onNewShift={() => setShift(null)} />}
        {view === "sale" && <SaleForm movement={editing?.kind === "sale" ? editing : null} onBack={() => goTo("home")} onSave={saveMovement} onDelete={removeMovement} />}
        {view === "movement" && <MovementForm movement={editing && editing.kind !== "sale" ? editing : null} onBack={() => goTo("home")} onSave={saveMovement} onDelete={removeMovement} />}
        {view === "close" && summary && <CloseView shift={shift} summary={summary} onClose={closeShift} onShare={sharePdf} onDownload={() => downloadBlob(createPdf(shift), fileName)} onBack={() => goTo("home")} />}
      </div>
      <nav className="bottom-nav" aria-label="Navegación principal">
        <NavButton icon={Home} label="Inicio" active={view === "home"} onClick={() => goTo("home")} />
        <NavButton icon={Plus} label="Venta" active={view === "sale"} disabled={shift.status === "closed"} onClick={() => goTo("sale")} />
        <NavButton icon={HandCoins} label="Movimiento" active={view === "movement"} disabled={shift.status === "closed"} onClick={() => goTo("movement")} />
        <NavButton icon={Check} label="Cierre" active={view === "close"} onClick={() => goTo("close")} />
      </nav>
      <Toaster position="top-center" richColors />
    </main>
  );
}

function OpenShift({ onOpen }: { onOpen: (base: number) => void }) {
  const [base, setBase] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = safeNumber(base);
    if (!base.trim()) return toast.error("Escribe la base inicial");
    onOpen(amount);
  }
  return (
    <main className="onboarding-shell">
      <section className="open-card">
        <div className="open-heading"><span className="brand-mark large"><ReceiptText /></span><span className="eyebrow">MiniCaja</span><h1>Empecemos el turno</h1><p>Registra el efectivo que recibes en caja. Lo demás lo calculamos por ti.</p></div>
        <form onSubmit={submit} className="amount-form">
          <label htmlFor="base">Base inicial</label>
          <div className="money-input featured"><span>$</span><input id="base" autoFocus inputMode="decimal" placeholder="0.00" value={base} onChange={(event) => setBase(event.target.value)} /></div>
          <button className="primary-button" type="submit">Abrir turno <ChevronRight /></button>
        </form>
        <p className="privacy-note"><Smartphone /> La información se guarda solamente en este dispositivo.</p>
      </section>
      <Toaster position="top-center" richColors />
    </main>
  );
}

function Dashboard({ shift, summary, onNavigate, onEdit, onShare, onDownload, onNewShift }: {
  shift: Shift; summary: ReturnType<typeof summarize>; onNavigate: (view: View) => void; onEdit: (movement: Movement) => void; onShare: () => void; onDownload: () => void; onNewShift: () => void;
}) {
  return (
    <div className="dashboard page-enter">
      <section className="hero-card">
        <div className="hero-label"><span className="live-dot" />Efectivo esperado</div>
        <strong className="hero-total">{money.format(summary.expectedCash)}</strong>
        <p>Lo que debería haber físicamente en caja ahora.</p>
        <div className="cash-equation"><span><small>Base</small><strong>{money.format(shift.base)}</strong></span><b>+</b><span><small>Ventas efectivo</small><strong>{money.format(summary.sales.cash)}</strong></span><b>{summary.providerCash - summary.otherCashNet >= 0 ? "−" : "+"}</b><span><small>Salidas netas</small><strong>{money.format(Math.abs(summary.providerCash - summary.otherCashNet))}</strong></span></div>
      </section>
      {shift.status === "closed" && <section className={`difference-banner ${(summary.difference ?? 0) === 0 ? "exact" : (summary.difference ?? 0) > 0 ? "over" : "short"}`}><span>{(summary.difference ?? 0) === 0 ? <Check /> : <CircleDollarSign />}</span><div><small>Resultado del corte</small><strong>{(summary.difference ?? 0) === 0 ? "Caja exacta" : `${(summary.difference ?? 0) > 0 ? "Sobran" : "Faltan"} ${money.format(Math.abs(summary.difference ?? 0))}`}</strong></div></section>}
      {shift.status === "open" ? (
        <section className="quick-actions"><button className="action-card sale" onClick={() => onNavigate("sale")}><span><Plus /></span><strong>Nueva venta</strong><small>Efectivo, tarjeta o transferencia</small><ChevronRight /></button><button className="action-card movement" onClick={() => onNavigate("movement")}><span><HandCoins /></span><strong>Pago o movimiento</strong><small>Proveedor, entrada, retiro o gasto</small><ChevronRight /></button></section>
      ) : (
        <section className="share-actions"><button className="primary-button whatsapp" onClick={onShare}><Share2 /> Compartir corte</button><button className="secondary-button" onClick={onDownload}><Download /> Descargar PDF</button></section>
      )}
      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">Ventas del turno</span><h2>{money.format(summary.salesTotal)}</h2></div><span className="count-badge">{shift.movements.filter((item) => item.kind === "sale").length} ventas</span></div>
        <div className="method-grid"><Metric icon={Banknote} label="Efectivo" value={summary.sales.cash} tone="cash" /><Metric icon={CreditCard} label="Tarjeta" value={summary.sales.card} tone="card" /><Metric icon={Landmark} label="Transferencia" value={summary.sales.transfer} tone="transfer" /></div>
      </section>
      <section className="summary-grid"><article><span className="metric-icon provider"><Building2 /></span><small>Proveedores</small><strong>{money.format(summary.providerTotal)}</strong><p>{money.format(summary.providerCash)} salió de caja</p></article><article><span className="metric-icon other"><WalletCards /></span><small>Otros movimientos</small><strong>{money.format(summary.entries - summary.withdrawals - summary.expenses)}</strong><p>{money.format(summary.otherCashNet)} en efectivo</p></article></section>
      <section className="section-block movements-block">
        <div className="section-heading compact"><div><span className="eyebrow">Actividad</span><h2>Movimientos recientes</h2></div>{shift.status === "open" && shift.movements.length > 0 && <small>Toca para editar</small>}</div>
        {shift.movements.length === 0 ? <div className="empty-state"><span><ReceiptText /></span><strong>Aún no hay movimientos</strong><p>Tu primera venta aparecerá aquí.</p></div> : (
          <div className="movement-list">{[...shift.movements].reverse().map((movement) => { const Icon = movementIcon(movement.kind); const PaymentIcon = methodIcon(movement.paymentMethod); return <button key={movement.id} onClick={() => shift.status === "open" && onEdit(movement)} disabled={shift.status === "closed"}><span className={`movement-symbol ${movement.kind}`}><Icon /></span><span className="movement-copy"><strong>{movement.party || movement.note || kindLabels[movement.kind]}</strong><small><PaymentIcon />{kindLabels[movement.kind]} · {paymentLabels[movement.paymentMethod]} · {new Date(movement.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</small></span><span className={`movement-amount ${isPositive(movement.kind) ? "positive" : "negative"}`}>{isPositive(movement.kind) ? "+" : "−"}{money.format(movement.amount)}</span>{shift.status === "open" && <Pencil className="edit-icon" />}</button>; })}</div>
        )}
      </section>
      {shift.status === "open" ? <button className="close-cta" onClick={() => onNavigate("close")}><span><Clock3 /></span><div><strong>¿Terminaste el día?</strong><small>Cuenta el efectivo y prepara tu corte</small></div><ChevronRight /></button> : (
        <AlertDialog><AlertDialogTrigger asChild><button className="new-shift-link"><RotateCcw /> Iniciar un nuevo turno</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Iniciar un nuevo turno?</AlertDialogTitle><AlertDialogDescription>El corte actual dejará de mostrarse en este dispositivo. Descarga el PDF antes si quieres conservarlo.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={onNewShift}>Sí, nuevo turno</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Banknote; label: string; value: number; tone: string }) {
  return <article className={`method-card ${tone}`}><span><Icon /></span><small>{label}</small><strong>{money.format(value)}</strong></article>;
}

function PageHeader({ title, eyebrow, onBack }: { title: string; eyebrow: string; onBack: () => void }) {
  return <div className="page-header"><button onClick={onBack} aria-label="Regresar"><ArrowLeft /></button><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div></div>;
}

function PaymentPicker({ value, onChange }: { value: PaymentMethod; onChange: (value: PaymentMethod) => void }) {
  return <div className="payment-picker" role="radiogroup" aria-label="Método de pago">{(["cash", "card", "transfer"] as PaymentMethod[]).map((method) => { const Icon = methodIcon(method); return <button key={method} type="button" role="radio" aria-checked={value === method} className={value === method ? "active" : ""} onClick={() => onChange(method)}><Icon /><span>{paymentLabels[method]}</span>{value === method && <Check />}</button>; })}</div>;
}

function SaleForm({ movement, onBack, onSave, onDelete }: { movement: Movement | null; onBack: () => void; onSave: (movement: Omit<Movement, "id" | "createdAt">, id?: string) => void; onDelete: (id: string) => void }) {
  const [amount, setAmount] = useState(movement ? String(movement.amount) : "");
  const [note, setNote] = useState(movement?.note ?? "");
  const [method, setMethod] = useState<PaymentMethod>(movement?.paymentMethod ?? "cash");
  function submit(event: FormEvent) { event.preventDefault(); const value = safeNumber(amount); if (value <= 0) return toast.error("Escribe un monto mayor a cero"); onSave({ kind: "sale", amount: value, note: note.trim(), party: "", paymentMethod: method, affectsCash: method === "cash" }, movement?.id); }
  return (
    <section className="form-page page-enter"><PageHeader eyebrow={movement ? "Editar movimiento" : "Registrar"} title={movement ? "Editar venta" : "Nueva venta"} onBack={onBack} /><form onSubmit={submit}>
      <label className="field-label" htmlFor="sale-amount">Monto de la venta</label><div className="money-input featured"><span>$</span><input id="sale-amount" autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
      <label className="field-label">Método de pago</label><PaymentPicker value={method} onChange={setMethod} />
      <div className={`cash-impact ${method === "cash" ? "yes" : "no"}`}><span>{method === "cash" ? <Banknote /> : <CreditCard />}</span><p><strong>{method === "cash" ? "Sí aumenta la caja" : "No cambia el efectivo"}</strong><small>{method === "cash" ? "Esta venta se sumará al efectivo esperado." : "La venta cuenta en el total, pero no en la caja física."}</small></p></div>
      <label className="field-label" htmlFor="sale-note">Concepto <small>Opcional</small></label><input className="text-input" id="sale-note" placeholder="Ej. Refrescos y botanas" value={note} onChange={(event) => setNote(event.target.value)} />
      <button className="primary-button form-submit" type="submit"><Check />{movement ? "Guardar cambios" : "Guardar venta"}</button>{movement && <DeleteMovement id={movement.id} onDelete={onDelete} />}
    </form></section>
  );
}

function MovementForm({ movement, onBack, onSave, onDelete }: { movement: Movement | null; onBack: () => void; onSave: (movement: Omit<Movement, "id" | "createdAt">, id?: string) => void; onDelete: (id: string) => void }) {
  const [kind, setKind] = useState<Exclude<MovementKind, "sale">>((movement?.kind ?? "provider") as Exclude<MovementKind, "sale">);
  const [amount, setAmount] = useState(movement ? String(movement.amount) : "");
  const [party, setParty] = useState(movement?.party ?? "");
  const [note, setNote] = useState(movement?.note ?? "");
  const [method, setMethod] = useState<PaymentMethod>(movement?.paymentMethod ?? "cash");
  const [affectsCash, setAffectsCash] = useState(movement?.affectsCash ?? true);
  function chooseMethod(next: PaymentMethod) { setMethod(next); setAffectsCash(next === "cash"); }
  function submit(event: FormEvent) { event.preventDefault(); const value = safeNumber(amount); if (value <= 0) return toast.error("Escribe un monto mayor a cero"); if (kind === "provider" && !party.trim()) return toast.error("Escribe el nombre del proveedor"); onSave({ kind, amount: value, party: party.trim(), note: note.trim(), paymentMethod: method, affectsCash: method === "cash" && affectsCash }, movement?.id); }
  return (
    <section className="form-page page-enter"><PageHeader eyebrow={movement ? "Editar movimiento" : "Registrar"} title={movement ? "Editar movimiento" : "Pago o movimiento"} onBack={onBack} /><form onSubmit={submit}>
      <label className="field-label">Tipo de movimiento</label><div className="kind-picker">{(["provider", "entry", "withdrawal", "expense"] as const).map((option) => { const Icon = movementIcon(option); return <button key={option} type="button" className={kind === option ? "active" : ""} onClick={() => setKind(option)}><Icon />{kindLabels[option]}</button>; })}</div>
      <label className="field-label" htmlFor="movement-amount">Monto</label><div className="money-input"><span>$</span><input id="movement-amount" autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
      {kind === "provider" && <><label className="field-label" htmlFor="provider-name">Proveedor</label><input className="text-input" id="provider-name" placeholder="Ej. Coca-Cola" value={party} onChange={(event) => setParty(event.target.value)} /></>}
      <label className="field-label">Método de pago</label><PaymentPicker value={method} onChange={chooseMethod} />
      {method === "cash" && kind === "provider" && <label className="toggle-row"><span><strong>Sale de la caja</strong><small>Actívalo si este pago reduce el efectivo físico.</small></span><input type="checkbox" checked={affectsCash} onChange={(event) => setAffectsCash(event.target.checked)} /><i /></label>}
      <div className={`cash-impact ${method === "cash" && affectsCash ? (kind === "entry" ? "yes" : "out") : "no"}`}><span>{method === "cash" && affectsCash ? <Banknote /> : <CreditCard />}</span><p><strong>{method === "cash" && affectsCash ? (kind === "entry" ? "Sí aumenta la caja" : "Sí reduce la caja") : "No cambia el efectivo"}</strong><small>{method === "cash" && affectsCash ? "Se reflejará en el efectivo esperado." : "Quedará registrado, sin modificar la caja física."}</small></p></div>
      <label className="field-label" htmlFor="movement-note">Nota <small>Opcional</small></label><input className="text-input" id="movement-note" placeholder="Agrega un detalle" value={note} onChange={(event) => setNote(event.target.value)} />
      <button className="primary-button form-submit" type="submit"><Check />{movement ? "Guardar cambios" : "Guardar movimiento"}</button>{movement && <DeleteMovement id={movement.id} onDelete={onDelete} />}
    </form></section>
  );
}

function DeleteMovement({ id, onDelete }: { id: string; onDelete: (id: string) => void }) {
  return <AlertDialog><AlertDialogTrigger asChild><button type="button" className="delete-button"><Trash2 /> Eliminar movimiento</button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => onDelete(id)}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function CloseView({ shift, summary, onClose, onShare, onDownload, onBack }: { shift: Shift; summary: ReturnType<typeof summarize>; onClose: (amount: number) => void; onShare: () => void; onDownload: () => void; onBack: () => void }) {
  const [counted, setCounted] = useState(shift.countedCash == null ? "" : String(shift.countedCash));
  const previewDifference = counted.trim() ? safeNumber(counted) - summary.expectedCash : null;
  if (shift.status === "closed") {
    const difference = summary.difference ?? 0;
    return <section className="close-page page-enter"><PageHeader eyebrow="Turno cerrado" title="Corte de caja" onBack={onBack} /><div className={`result-card ${difference === 0 ? "exact" : difference > 0 ? "over" : "short"}`}><span>{difference === 0 ? <Check /> : <CircleDollarSign />}</span><small>Resultado</small><h2>{difference === 0 ? "Caja exacta" : difference > 0 ? "Sobrante" : "Faltante"}</h2><strong>{money.format(Math.abs(difference))}</strong><p>{difference === 0 ? "El efectivo contado coincide con lo esperado." : `Contaste ${money.format(shift.countedCash ?? 0)} y esperábamos ${money.format(summary.expectedCash)}.`}</p></div><CutSummary shift={shift} summary={summary} /><div className="share-actions sticky-actions"><button className="primary-button whatsapp" onClick={onShare}><Share2 /> Compartir corte</button><button className="secondary-button" onClick={onDownload}><Download /> Descargar PDF</button></div></section>;
  }
  return (
    <section className="close-page page-enter"><PageHeader eyebrow="Último paso" title="Cierre de caja" onBack={onBack} /><div className="count-prompt"><span><CircleDollarSign /></span><h2>Cuenta el efectivo</h2><p>Incluye la base y todo el dinero físico que quedó en caja.</p></div><form>
      <label className="field-label" htmlFor="counted-cash">Efectivo contado</label><div className="money-input featured"><span>$</span><input id="counted-cash" autoFocus inputMode="decimal" placeholder="0.00" value={counted} onChange={(event) => setCounted(event.target.value)} /></div>
      <div className="expected-row"><span>Efectivo esperado</span><strong>{money.format(summary.expectedCash)}</strong></div>{previewDifference != null && <div className={`difference-preview ${previewDifference === 0 ? "exact" : previewDifference > 0 ? "over" : "short"}`}><small>Diferencia</small><strong>{previewDifference === 0 ? "Exacto" : `${previewDifference > 0 ? "+" : "−"}${money.format(Math.abs(previewDifference))}`}</strong></div>}
      <AlertDialog><AlertDialogTrigger asChild><button className="primary-button form-submit" type="button" disabled={!counted.trim()}><Check /> Revisar y cerrar turno</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Cerrar el turno?</AlertDialogTitle><AlertDialogDescription>Después del cierre ya no podrás editar los movimientos. Podrás descargar y compartir el corte en PDF.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Seguir revisando</AlertDialogCancel><AlertDialogAction onClick={() => onClose(safeNumber(counted))}>Sí, cerrar turno</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </form><CutSummary shift={shift} summary={summary} /></section>
  );
}

function CutSummary({ shift, summary }: { shift: Shift; summary: ReturnType<typeof summarize> }) {
  const rows = [["Base inicial", shift.base], ["Ventas en efectivo", summary.sales.cash], ["Ventas con tarjeta", summary.sales.card], ["Ventas por transferencia", summary.sales.transfer], ["Pagos a proveedores", -summary.providerTotal], ["Otros movimientos en efectivo", summary.otherCashNet]] as const;
  return <section className="cut-summary"><div className="section-heading compact"><div><span className="eyebrow">Resumen</span><h2>Así se compone el turno</h2></div></div><div>{rows.map(([label, value]) => <p key={label}><span>{label}</span><strong className={value < 0 ? "negative" : ""}>{value < 0 ? "−" : ""}{money.format(Math.abs(value))}</strong></p>)}<p className="total"><span>Efectivo esperado</span><strong>{money.format(summary.expectedCash)}</strong></p></div></section>;
}

function NavButton({ icon: Icon, label, active, disabled, onClick }: { icon: typeof Home; label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} disabled={disabled} onClick={onClick}><Icon /><span>{label}</span></button>;
}
