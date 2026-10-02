import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      <span
        aria-hidden
        className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full text-sm"
      >
        O
      </span>
      <span className="text-lg">Orkestra</span>
    </span>
  );
}
