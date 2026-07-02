"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "@/components/events/section-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EventQuestion, EventQuestionType } from "@/types/events";

// ─── Question types ───────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<EventQuestionType, string> = {
	email: "Email",
	short_text: "Texte court",
	long_text: "Texte long",
	single_select: "Choix unique",
	multi_select: "Choix multiple",
	yes_no: "Oui / Non",
	number: "Nombre",
};

const TYPES_WITH_OPTIONS: EventQuestionType[] = [
	"single_select",
	"multi_select",
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface QuestionsSectionProps {
	eventId: string;
	questions: EventQuestion[];
	onSaveQuestions: (questions: EventQuestion[]) => Promise<void>;
}

// ─── Composant ────────────────────────────────────────────────────────────────

/**
 * QuestionsSection — liste de questions drag-to-reorder, types multiples, options.
 * Pas de Convex mutations directes — délègue via onSaveQuestions.
 */
export function QuestionsSection({
	eventId,
	questions: initialQuestions,
	onSaveQuestions,
}: QuestionsSectionProps) {
	const [questions, setQuestions] = useState<EventQuestion[]>([
		...initialQuestions,
	]);
	const [isDirty, setIsDirty] = useState(false);

	useEffect(() => {
		setQuestions([...initialQuestions]);
		setIsDirty(false);
	}, [initialQuestions]);

	// Drag sensors
	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		setQuestions((prev) => {
			const oldIndex = prev.findIndex((q) => q._id === active.id);
			const newIndex = prev.findIndex((q) => q._id === over.id);
			const reordered = arrayMove(prev, oldIndex, newIndex).map((q, i) => ({
				...q,
				order: i,
			}));
			return reordered;
		});
		setIsDirty(true);
	}, []);

	const addQuestion = useCallback(() => {
		const newQ: EventQuestion = {
			_id: `temp-${Date.now()}`,
			eventId,
			order: questions.length,
			type: "short_text",
			label: "",
			required: false,
		};
		setQuestions((prev) => [...prev, newQ]);
		setIsDirty(true);
	}, [questions.length, eventId]);

	const updateQuestion = useCallback(
		(id: string, patch: Partial<EventQuestion>) => {
			setQuestions((prev) =>
				prev.map((q) => (q._id === id ? { ...q, ...patch } : q)),
			);
			setIsDirty(true);
		},
		[],
	);

	const removeQuestion = useCallback((id: string) => {
		setQuestions((prev) =>
			prev.filter((q) => q._id !== id).map((q, i) => ({ ...q, order: i })),
		);
		setIsDirty(true);
	}, []);

	const handleSave = useCallback(async () => {
		await onSaveQuestions(questions);
		setIsDirty(false);
	}, [questions, onSaveQuestions]);

	const handleCancel = useCallback(() => {
		setQuestions([...initialQuestions]);
		setIsDirty(false);
	}, [initialQuestions]);

	return (
		<SectionShell
			icon={MessageSquare}
			title="Questions des invités"
			description="Personnalise le formulaire de qualification affiché aux prospects."
			onSave={handleSave}
			isDirty={isDirty}
			onCancel={handleCancel}
		>
			<div className="space-y-4 max-w-[540px]">
				{/* Liste drag-and-drop */}
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={questions.map((q) => q._id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="space-y-2">
							{questions.length === 0 && (
								<EmptyQuestionsState onAdd={addQuestion} />
							)}
							{questions.map((question) => (
								<SortableQuestionRow
									key={question._id}
									question={question}
									onChange={(patch) => updateQuestion(question._id, patch)}
									onRemove={() => removeQuestion(question._id)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>

				{/* Bouton ajouter */}
				{questions.length > 0 && (
					<Button
						variant="outline"
						size="sm"
						onClick={addQuestion}
						className="gap-1.5 w-full border-dashed"
					>
						<Plus className="w-3.5 h-3.5" />
						Ajouter une question
					</Button>
				)}

				{/* Info email fixe */}
				<p className="text-[11px] text-[var(--ink-ghost)] bg-[var(--surface-raised)] rounded-[var(--radius-sm)] px-3 py-2 border border-[var(--border)]">
					Les champs <strong>Prénom</strong>, <strong>Nom</strong>,{" "}
					<strong>Téléphone</strong> et <strong>Email</strong> sont toujours
					présents en première étape et ne peuvent pas être supprimés.
				</p>
			</div>
		</SectionShell>
	);
}

// ─── SortableQuestionRow ──────────────────────────────────────────────────────

interface SortableQuestionRowProps {
	question: EventQuestion;
	onChange: (patch: Partial<EventQuestion>) => void;
	onRemove: () => void;
}

function SortableQuestionRow({
	question,
	onChange,
	onRemove,
}: SortableQuestionRowProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: question._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const hasOptions = TYPES_WITH_OPTIONS.includes(question.type);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]",
				"transition-shadow duration-150",
				isDragging && "shadow-[var(--shadow-float)] opacity-80 z-50 relative",
			)}
		>
			{/* Row principale */}
			<div className="flex items-start gap-2.5 px-4 pt-3 pb-3">
				{/* Drag handle */}
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="mt-0.5 text-[var(--ink-ghost)] hover:text-[var(--ink-muted)] cursor-grab active:cursor-grabbing focus-visible:outline-none shrink-0 p-0.5 rounded"
					aria-label="Déplacer la question"
				>
					<GripVertical className="w-4 h-4" />
				</button>

				<div className="flex-1 space-y-2.5">
					{/* Label + type */}
					<div className="flex items-start gap-2">
						<Input
							value={question.label}
							onChange={(e) => onChange({ label: e.target.value })}
							placeholder="Libellé de la question..."
							className="h-9 flex-1"
						/>
						<Select
							value={question.type}
							onValueChange={(v) =>
								onChange({
									type: v as EventQuestionType,
									options: TYPES_WITH_OPTIONS.includes(v as EventQuestionType)
										? (question.options ?? [""])
										: undefined,
									disqualifyingValues: undefined,
								})
							}
						>
							<SelectTrigger className="h-9 w-[140px] shrink-0 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(
									Object.entries(QUESTION_TYPE_LABELS) as [
										EventQuestionType,
										string,
									][]
								).map(([value, label]) => (
									<SelectItem key={value} value={value} className="text-xs">
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Options (si choix) */}
					{hasOptions && (
						<OptionsEditor
							options={question.options ?? [""]}
							onChange={(opts) => onChange({ options: opts })}
						/>
					)}

					{/* Required + disqualifying */}
					<div className="flex items-center gap-4 pt-0.5">
						{/* biome-ignore lint/a11y/noLabelWithoutControl: checkbox is inside the label */}
						<label className="flex items-center gap-2 cursor-pointer">
							<Checkbox
								id={`req-${question._id}`}
								checked={question.required}
								onCheckedChange={(v) => onChange({ required: Boolean(v) })}
								className="h-3.5 w-3.5"
							/>
							<span className="text-xs text-[var(--ink-muted)]">
								Obligatoire
							</span>
						</label>
					</div>
				</div>

				{/* Supprimer */}
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onRemove}
					className="shrink-0 mt-0.5 text-[var(--ink-ghost)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
					aria-label="Supprimer la question"
				>
					<Trash2 className="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
	);
}

// ─── OptionsEditor ────────────────────────────────────────────────────────────

function OptionsEditor({
	options,
	onChange,
}: {
	options: string[];
	onChange: (opts: string[]) => void;
}) {
	const updateOption = (index: number, value: string) => {
		const next = [...options];
		next[index] = value;
		onChange(next);
	};

	const addOption = () => onChange([...options, ""]);

	const removeOption = (index: number) => {
		if (options.length <= 1) return;
		onChange(options.filter((_, i) => i !== index));
	};

	return (
		<div className="space-y-1.5 pl-1">
			<Label className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-ghost)]">
				Options de réponse
			</Label>
			{options.map((opt, i) => (
				<div key={i} className="flex items-center gap-1.5">
					<div className="w-1.5 h-1.5 rounded-full bg-[var(--ink-ghost)] shrink-0 mt-0.5" />
					<Input
						value={opt}
						onChange={(e) => updateOption(i, e.target.value)}
						placeholder={`Option ${i + 1}`}
						className="h-7 text-xs flex-1"
					/>
					{options.length > 1 && (
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => removeOption(i)}
							className="text-[var(--ink-ghost)] hover:text-[var(--destructive)] h-6 w-6"
						>
							<Trash2 className="w-3 h-3" />
						</Button>
					)}
				</div>
			))}
			<button
				type="button"
				onClick={addOption}
				className="text-xs text-[var(--brand)] hover:text-[var(--brand-bright)] font-medium flex items-center gap-1 mt-1"
			>
				<Plus className="w-3 h-3" />
				Ajouter une option
			</button>
		</div>
	);
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyQuestionsState({ onAdd }: { onAdd: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-raised)]">
			<MessageSquare className="w-8 h-8 text-[var(--ink-ghost)]" />
			<div className="text-center">
				<p className="text-sm font-medium text-[var(--ink)]">
					Aucune question de qualification
				</p>
				<p className="text-xs text-[var(--ink-muted)] mt-0.5 max-w-xs">
					Ajoute des questions pour qualifier tes prospects avant la prise de
					RDV.
				</p>
			</div>
			<Button size="sm" onClick={onAdd} className="gap-1.5">
				<Plus className="w-3.5 h-3.5" />
				Ajouter une question
			</Button>
		</div>
	);
}
