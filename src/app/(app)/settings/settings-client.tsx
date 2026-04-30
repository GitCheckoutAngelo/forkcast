'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateProfile, updateMacroTarget, updatePreferences } from '@/lib/profile/actions'
import { deleteAllMealPlans } from '@/lib/meal-plans/actions'
import { logout } from '@/lib/auth/actions'
import { createClient } from '@/lib/supabase/browser'
import type { MacroTarget, WeekStartDay } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Evaluated once; native <select> handles the 500-item list via browser scrolling.
const TIMEZONES: string[] = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Intl as any).supportedValuesOf('timeZone') as string[]
  } catch {
    return [
      'UTC',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
      'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
      'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
    ]
  }
})()

// ── Shared primitives ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileSection({
  displayName: initial,
  email,
}: {
  displayName: string | null
  email: string
}) {
  const [displayName, setDisplayName] = useState(initial ?? '')
  const [isPending, startTransition] = useTransition()

  function handleBlur() {
    const trimmed = displayName.trim()
    if (trimmed === (initial ?? '')) return
    startTransition(async () => {
      const result = await updateProfile({ display_name: trimmed || null })
      if (result.error) toast.error(result.error)
      else toast.success('Profile saved')
    })
  }

  return (
    <Section title="Profile">
      <Field label="Display name">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={handleBlur}
          disabled={isPending}
          placeholder="Your name"
        />
      </Field>
      <Field label="Email" hint="Contact support to change your email.">
        <Input value={email} readOnly className="text-muted-foreground" />
      </Field>
    </Section>
  )
}

// ── Macro target ──────────────────────────────────────────────────────────────

type MacroFields = {
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
  tolerance_pct: string
}

function MacroTargetSection({ macroTarget: initial }: { macroTarget: MacroTarget | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmClear, setConfirmClear] = useState(false)

  const [fields, setFields] = useState<MacroFields>({
    calories: initial?.calories != null ? String(initial.calories) : '',
    protein_g: initial?.protein_g != null ? String(initial.protein_g) : '',
    carbs_g: initial?.carbs_g != null ? String(initial.carbs_g) : '',
    fat_g: initial?.fat_g != null ? String(initial.fat_g) : '',
    tolerance_pct: String(initial?.tolerance_pct ?? 5),
  })
  const [errors, setErrors] = useState<Partial<MacroFields>>({})

  function set(key: keyof MacroFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<MacroFields> = {}
    const cal = parseFloat(fields.calories)
    const pro = parseFloat(fields.protein_g)
    const carbs = parseFloat(fields.carbs_g)
    const fat = parseFloat(fields.fat_g)
    const tol = parseFloat(fields.tolerance_pct)
    if (!fields.calories || isNaN(cal) || cal <= 0) e.calories = 'Must be greater than 0'
    if (!fields.protein_g || isNaN(pro) || pro < 0) e.protein_g = 'Must be 0 or greater'
    if (!fields.carbs_g || isNaN(carbs) || carbs < 0) e.carbs_g = 'Must be 0 or greater'
    if (!fields.fat_g || isNaN(fat) || fat < 0) e.fat_g = 'Must be 0 or greater'
    if (isNaN(tol) || tol < 0 || tol > 20) e.tolerance_pct = 'Must be between 0 and 20'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave() {
    if (!validate()) return
    startTransition(async () => {
      const result = await updateMacroTarget({
        calories: parseFloat(fields.calories),
        protein_g: parseFloat(fields.protein_g),
        carbs_g: parseFloat(fields.carbs_g),
        fat_g: parseFloat(fields.fat_g),
        tolerance_pct: parseFloat(fields.tolerance_pct),
      })
      if (result.error) toast.error(result.error)
      else { toast.success('Macro target saved'); router.refresh() }
    })
  }

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return }
    startTransition(async () => {
      const result = await updateMacroTarget(null)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Macro target cleared')
        setFields({ calories: '', protein_g: '', carbs_g: '', fat_g: '', tolerance_pct: '5' })
        setConfirmClear(false)
        router.refresh()
      }
    })
  }

  const calNum = parseFloat(fields.calories)
  const tolNum = parseFloat(fields.tolerance_pct)
  const showPreview = !isNaN(calNum) && calNum > 0 && !isNaN(tolNum) && tolNum >= 0 && tolNum <= 20

  const MACRO_FIELDS = [
    { key: 'calories' as const, label: 'Calories', unit: 'kcal' },
    { key: 'protein_g' as const, label: 'Protein', unit: 'g' },
    { key: 'carbs_g' as const, label: 'Carbs', unit: 'g' },
    { key: 'fat_g' as const, label: 'Fat', unit: 'g' },
  ]

  return (
    <Section title="Macro target">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {MACRO_FIELDS.map(({ key, label, unit }) => (
          <Field key={key} label={`${label} (${unit})`} error={errors[key]}>
            <Input
              type="number"
              min="0"
              value={fields[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder="—"
              disabled={isPending}
            />
          </Field>
        ))}
      </div>

      <Field
        label="Tolerance (%)"
        hint="Within this range, a day reads 'on target.' Outside, it reads 'under' or 'over.'"
        error={errors.tolerance_pct}
      >
        <Input
          type="number"
          min="0"
          max="20"
          step="1"
          value={fields.tolerance_pct}
          onChange={(e) => set('tolerance_pct', e.target.value)}
          className="w-24"
          disabled={isPending}
        />
      </Field>

      {showPreview && (
        <p className="text-sm text-muted-foreground">
          At {tolNum}% tolerance, your calorie target is{' '}
          <span className="font-medium text-foreground tabular-nums">
            {Math.round(calNum * (1 - tolNum / 100)).toLocaleString()}
          </span>
          {' – '}
          <span className="font-medium text-foreground tabular-nums">
            {Math.round(calNum * (1 + tolNum / 100)).toLocaleString()}
          </span>
          {' kcal.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button onClick={handleSave} disabled={isPending} size="sm">
          {isPending ? 'Saving…' : 'Save target'}
        </Button>
        {initial !== null && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={isPending}
            className={confirmClear ? 'border-destructive text-destructive hover:bg-destructive/5' : ''}
          >
            {confirmClear ? 'Confirm clear' : 'Clear target'}
          </Button>
        )}
        {confirmClear && (
          <button
            onClick={() => setConfirmClear(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </Section>
  )
}

// ── Preferences ───────────────────────────────────────────────────────────────

function PreferencesSection({
  weekStartDay: initialDay,
  timezone: initialTz,
  planCount,
}: {
  weekStartDay: WeekStartDay
  timezone: string
  planCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const detectedTz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC'

  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(initialDay)
  const [timezone, setTimezone] = useState(initialTz || detectedTz)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPlanCount, setCurrentPlanCount] = useState(planCount)

  function handleSave() {
    setSaveError(null)
    startTransition(async () => {
      const result = await updatePreferences({ week_start_day: weekStartDay, timezone })
      if (result.error) setSaveError(result.error)
      else { toast.success('Preferences saved'); router.refresh() }
    })
  }

  async function handleDeleteAll() {
    setIsDeleting(true)
    const result = await deleteAllMealPlans()
    setIsDeleting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setConfirmDeleteAll(false)
    setCurrentPlanCount(0)
    toast.success('All meal plans deleted')
  }

  return (
    <>
      <Section title="Preferences">
        <Field label="Week start day">
          {currentPlanCount > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {DAY_NAMES[weekStartDay]}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                You have {currentPlanCount} meal {currentPlanCount === 1 ? 'plan' : 'plans'}.{' '}
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="underline hover:opacity-80"
                >
                  Delete them
                </button>
                {' '}before changing your week start day.
              </p>
            </div>
          ) : (
            <Select
              value={String(weekStartDay)}
              onValueChange={(v) => v && setWeekStartDay(Number(v) as WeekStartDay)}
            >
              <SelectTrigger>
                <SelectValue>{DAY_NAMES[weekStartDay]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((name, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Timezone">
          {/* Native select — 500+ options render and scroll more efficiently this way. */}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <div className="pt-1">
          <Button onClick={handleSave} disabled={isPending} size="sm">
            {isPending ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </Section>

      <Dialog
        open={confirmDeleteAll}
        onOpenChange={(v) => { if (!v && !isDeleting) setConfirmDeleteAll(false) }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all meal plans?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            All {currentPlanCount} meal {currentPlanCount === 1 ? 'plan' : 'plans'} and their entries will be permanently removed. This cannot be undone.
          </p>
          <DialogFooter className="-mx-6 -mb-6">
            <DialogClose
              render={<Button variant="outline" type="button" />}
              disabled={isDeleting}
            >
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete all plans'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountSection({ email }: { email: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChangePassword() {
    setPasswordError(null)
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setPasswordError(error.message)
      } else {
        toast.success('Password updated')
        handleClose()
      }
    })
  }

  function handleClose() {
    setDialogOpen(false)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
  }

  return (
    <>
      <Section title="Account">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{email}</p>
          <Separator />
          <div className="flex flex-wrap gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              Change password
            </Button>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </Section>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="New password" error={passwordError ?? undefined}>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null) }}
                placeholder="At least 8 characters"
                disabled={isPending}
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isPending}
                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={isPending}>
              {isPending ? 'Updating…' : 'Update password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface SettingsClientProps {
  profile: {
    id: string
    display_name: string | null
    email: string
    macro_target: MacroTarget | null
    week_start_day: WeekStartDay
    timezone: string
  }
  planCount: number
}

export default function SettingsClient({ profile, planCount }: SettingsClientProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Account
        </p>
        <h1 className="mt-1 font-heading text-3xl tracking-tight text-foreground">Settings</h1>
      </div>

      <ProfileSection displayName={profile.display_name} email={profile.email} />
      <MacroTargetSection macroTarget={profile.macro_target} />
      <PreferencesSection
        weekStartDay={profile.week_start_day}
        timezone={profile.timezone}
        planCount={planCount}
      />
      <AccountSection email={profile.email} />
    </div>
  )
}
