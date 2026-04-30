'use client'

import { memo } from 'react'
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
}: {
  day: PlanDayResolved
  onAddClick: (slotId: string) => void
  isEditMode: boolean
}) {
  const date = new Date(day.date + 'T00:00:00')
  const dayName = SHORT_DAYS[date.getDay()]
  const dateLabel = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
  const kcal = Math.round(day.total_macros.calories)
  const calStatus = day.target_status?.calories ?? null

  return (
    <div className="flex flex-col gap-3 px-4 py-10 lg:flex-row lg:gap-4">
      {/* Day info column */}
      <div className="flex items-start justify-between gap-3 lg:w-36 lg:shrink-0 lg:flex-col lg:justify-start">
        <div>
          <p className="font-heading text-base font-medium text-foreground">{dayName}</p>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </div>

        {kcal > 0 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 lg:mt-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {kcal.toLocaleString()} kcal
              {' · '}{Math.round(day.total_macros.protein_g)}g P
              {' · '}{Math.round(day.total_macros.carbs_g)}g C
              {' · '}{Math.round(day.total_macros.fat_g)}g F
            </span>
            {calStatus && <StatusDot status={calStatus} />}
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
            isEditMode={isEditMode}
          />
        ))}
      </div>
    </div>
  )
}

export default memo(DayRow)
