'use client'

import { memo, useEffect, useRef, useState } from 'react'
import SlotColumn from './slot-column'
import type { PlanDayResolved, MealSlotType } from '@/types'
import { cn } from '@/lib/utils'

const SLOT_TYPES: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function StatusDot({ status }: { status: 'under' | 'on' | 'over' }) {
  const dot = {
    on:    'bg-emerald-500/50',
    under: 'bg-amber-500/50',
    over:  'bg-red-500/50',
  }
  const label = { on: 'on target', under: 'below target', over: 'above target' }
  return (
    <span className="flex items-center gap-1.5 text-xs italic text-muted-foreground">
      <span className={cn('size-2 shrink-0 rounded-full', dot[status])} />
      {label[status]}
    </span>
  )
}


function DayRow({
  day,
  onAddClick,
  isEditMode,
  isHighlighted = false,
  isRefreshing = false,
  onRefresh,
}: {
  day: PlanDayResolved
  onAddClick: (slotId: string) => void
  isEditMode: boolean
  isHighlighted?: boolean
  isRefreshing?: boolean
  onRefresh: () => void
}) {
  const date = new Date(day.date + 'T00:00:00')
  const dayName = SHORT_DAYS[date.getDay()]
  const dateLabel = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
  const kcal = Math.round(day.total_macros.calories)
  const calStatus = day.target_status?.calories ?? null

  const rowRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState(isHighlighted)

  useEffect(() => {
    if (!isHighlighted) return
    const scroll = setTimeout(() => {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    const fade = setTimeout(() => setFlash(false), 800)
    return () => { clearTimeout(scroll); clearTimeout(fade) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={rowRef}
      className="flex flex-col gap-3 px-4 py-10 lg:flex-row lg:gap-4 transition-[background-color] duration-[1200ms] ease-out"
      style={{ backgroundColor: flash ? 'rgba(200, 90, 26, 0.07)' : '' }}
    >
      {/* Day info column */}
      <div className="flex items-start justify-between gap-3 lg:w-36 lg:shrink-0 lg:flex-col lg:justify-start">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-heading text-base font-medium text-foreground">{dayName}</p>
            {isHighlighted && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: 'rgba(200, 90, 26, 0.12)', color: '#C85A1A' }}>
                Today
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </div>

        {kcal > 0 && (
          <div className={cn(
            'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 lg:mt-2 transition-opacity duration-150',
            isRefreshing && 'opacity-40',
          )}>
            <span className={cn('text-xs text-muted-foreground tabular-nums', isRefreshing && 'animate-pulse')}>
              {kcal.toLocaleString()} kcal
              {' · '}{Math.round(day.total_macros.protein_g)}g P
              {' · '}{Math.round(day.total_macros.carbs_g)}g C
              {' · '}{Math.round(day.total_macros.fat_g)}g F
            </span>
            {calStatus && !isRefreshing && <StatusDot status={calStatus} />}
          </div>
        )}
      </div>

      {/* Slot columns */}
      <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
        {SLOT_TYPES.map((type) => (
          <SlotColumn
            key={type}
            slots={day.slots}
            slotType={type}
            planDayId={day.id}
            onAddClick={onAddClick}
            onRefresh={onRefresh}
            isEditMode={isEditMode}
          />
        ))}
      </div>
    </div>
  )
}

export default memo(DayRow)
