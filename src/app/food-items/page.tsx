export default function FoodItemsPage() {
  return (
    <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center">
      <div className="w-full max-w-3xl rounded-[2rem] border border-border bg-card p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Food Items
        </p>
        <h1 className="mt-4 text-4xl font-heading tracking-tight text-foreground">
          Coming soon
        </h1>
        <p className="mt-3 text-base leading-7 text-foreground/75">
          Food item tracking is being built here next.
        </p>
      </div>
    </div>
  )
}
