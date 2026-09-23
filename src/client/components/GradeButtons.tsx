/**
 * Escala FSRS. Los nombres en español importan: "Otra vez" comunica
 * mejor que "Again" que la tarjeta vuelve, no que fallaste.
 */
const GRADES = [
  { g: 1, label: "Otra vez", hint: "No la sabía", cls: "bg-red-500 hover:bg-red-600" },
  { g: 2, label: "Difícil",  hint: "Me costó",    cls: "bg-amber-500 hover:bg-amber-600" },
  { g: 3, label: "Bien",     hint: "La sabía",    cls: "bg-emerald-500 hover:bg-emerald-600" },
  { g: 4, label: "Fácil",    hint: "Inmediata",   cls: "bg-sky-500 hover:bg-sky-600" },
] as const;

export function GradeButtons({
  onGrade, disabled,
}: { onGrade: (g: number) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {GRADES.map(({ g, label, hint, cls }) => (
        <button
          key={g}
          onClick={() => onGrade(g)}
          disabled={disabled}
          className={`${cls} rounded-xl px-2 py-3 text-white transition disabled:opacity-40`}
        >
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-[11px] opacity-80">{hint}</span>
          <span className="mt-1 block text-[10px] opacity-60">{g}</span>
        </button>
      ))}
    </div>
  );
}
