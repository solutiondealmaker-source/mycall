"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { EventSidebarNav } from "@/components/events/event-sidebar-nav";
import { CalendarInvitationSection } from "@/components/events/sections/calendar-invitation-section";
import { ConfirmationSection } from "@/components/events/sections/confirmation-section";
import { DetailsSection } from "@/components/events/sections/details-section";
import { DisqualificationSection } from "@/components/events/sections/disqualification-section";
import { HostsSection } from "@/components/events/sections/hosts-section";
import { QuestionsSection } from "@/components/events/sections/questions-section";
import { ScheduleSection } from "@/components/events/sections/schedule-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, publicBookingUrl } from "@/lib/utils";
import type {
	EventDoc,
	EventHost,
	EventPatch,
	EventQuestion,
	EventSectionKey,
} from "@/types/events";

interface EditEventPageProps {
	params: Promise<{ id: string }>;
}

export default function EditEventPage({ params }: EditEventPageProps) {
	const { id: rawId } = use(params);
	const id = rawId as Id<"events">;

	const event = useQuery(api.events.getById, { id }) as
		| EventDoc
		| null
		| undefined;
	const hostsRaw = useQuery(api.events.listHostsByEvent, { eventId: id });
	const questionsRaw = useQuery(api.events.listQuestionsByEvent, {
		eventId: id,
	});
	const availableUsers = useQuery(api.events.listAvailableHosts, {});

	const updateEvent = useMutation(api.events.update);
	const addHostMut = useMutation(api.events.addHost);
	const removeHostMut = useMutation(api.events.removeHost);
	const updateHostPriorityMut = useMutation(api.events.updateHostPriority);
	const setQuestionsMut = useMutation(api.events.setQuestions);

	const [activeSection, setActiveSection] =
		useState<EventSectionKey>("details");

	const handleUpdate = useCallback(
		async (patch: EventPatch) => {
			// EventPatch is a structural subset of mutation args; cast safely.
			await updateEvent({
				...(patch as Parameters<typeof updateEvent>[0]),
				id,
			});
		},
		[id, updateEvent],
	);

	const handleAddHost = useCallback(
		async (userId: string, priority: "high" | "medium" | "low") => {
			await addHostMut({
				eventId: id,
				userId: userId as Id<"users">,
				priority,
			});
		},
		[id, addHostMut],
	);

	const handleRemoveHost = useCallback(
		async (hostId: string) => {
			await removeHostMut({ eventHostId: hostId as Id<"eventHosts"> });
		},
		[removeHostMut],
	);

	const handleUpdateHostPriority = useCallback(
		async (hostId: string, priority: "high" | "medium" | "low") => {
			await updateHostPriorityMut({
				eventHostId: hostId as Id<"eventHosts">,
				priority,
			});
		},
		[updateHostPriorityMut],
	);

	const handleSaveQuestions = useCallback(
		async (updatedQuestions: EventQuestion[]) => {
			await setQuestionsMut({
				eventId: id,
				questions: updatedQuestions.map((q) => ({
					type: q.type,
					label: q.label,
					required: q.required,
					options: q.options,
					disqualifyingValues: q.disqualifyingValues,
				})),
			});
		},
		[id, setQuestionsMut],
	);

	const publicUrl = `/book/${event?.slug ?? ""}`;

	const copyPublicUrl = useCallback(() => {
		navigator.clipboard
			.writeText(publicBookingUrl(event?.slug ?? ""))
			.then(() => {
				toast.success("URL copiée dans le presse-papier");
			});
	}, [event?.slug]);

	if (
		event === undefined ||
		hostsRaw === undefined ||
		questionsRaw === undefined ||
		availableUsers === undefined
	) {
		return <EditPageSkeleton />;
	}

	if (event === null) {
		return (
			<div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] gap-3">
				<p className="text-sm text-[var(--ink-muted)]">
					Événement introuvable.
				</p>
				<Button asChild variant="outline" size="sm">
					<Link href="/events">Retour aux événements</Link>
				</Button>
			</div>
		);
	}

	const hosts = hostsRaw as EventHost[];
	const questions = questionsRaw as EventQuestion[];

	return (
		<div className="flex flex-col h-[calc(100vh-56px)] animate-fade-in">
			{/* Header */}
			<div
				className={cn(
					"shrink-0 h-14 px-6",
					"border-b border-[var(--border)]",
					"bg-[var(--surface)]/95 backdrop-blur-md",
					"flex items-center gap-4",
					"relative z-10",
				)}
			>
				<Button
					variant="ghost"
					size="sm"
					asChild
					className="text-[var(--ink-muted)] hover:text-[var(--ink)] gap-1.5 px-2"
				>
					<Link href="/events">
						<ArrowLeft className="w-3.5 h-3.5" />
						Retour
					</Link>
				</Button>

				<div className="w-px h-5 bg-[var(--border)]" />

				<div className="flex items-center gap-2 flex-1 min-w-0">
					<h1 className="text-sm font-semibold font-[family-name:var(--font-display)] text-[var(--ink)] truncate">
						{event.name}
					</h1>
					<Badge
						variant="secondary"
						className={cn(
							"text-[10px] px-2 py-0 h-5 shrink-0 border-0 font-medium",
							event.isActive
								? "bg-[var(--success-soft)] text-[var(--success)]"
								: "bg-[var(--surface-muted)] text-[var(--ink-ghost)]",
						)}
					>
						{event.isActive ? "Actif" : "Inactif"}
					</Badge>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={copyPublicUrl}
						className="gap-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] text-xs"
					>
						<Copy className="w-3.5 h-3.5" />
						Copier l'URL
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => window.open(publicUrl, "_blank")}
						className="gap-1.5 text-xs"
					>
						<ExternalLink className="w-3.5 h-3.5" />
						Prévisualiser
					</Button>
				</div>
			</div>

			<div className="flex flex-1 overflow-hidden">
				<EventSidebarNav
					activeSection={activeSection}
					onSectionChange={setActiveSection}
				/>

				<div className="flex-1 overflow-hidden">
					<AnimatePresence mode="wait">
						<motion.div
							key={activeSection}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
							className="h-full"
						>
							{activeSection === "details" && (
								<DetailsSection event={event} onUpdate={handleUpdate} />
							)}
							{activeSection === "hosts" && (
								<HostsSection
									event={event}
									hosts={hosts}
									availableUsers={availableUsers}
									onUpdate={handleUpdate}
									onAddHost={handleAddHost}
									onRemoveHost={handleRemoveHost}
									onUpdateHostPriority={handleUpdateHostPriority}
								/>
							)}
							{activeSection === "schedule" && (
								<ScheduleSection event={event} onUpdate={handleUpdate} />
							)}
							{activeSection === "questions" && (
								<QuestionsSection
									eventId={event._id}
									questions={questions}
									onSaveQuestions={handleSaveQuestions}
								/>
							)}
							{activeSection === "disqualification" && (
								<DisqualificationSection
									event={event}
									questions={questions}
									onUpdate={handleUpdate}
								/>
							)}
							{activeSection === "invitation" && (
								<CalendarInvitationSection
									event={event}
									onUpdate={handleUpdate}
								/>
							)}
							{activeSection === "confirmation" && (
								<ConfirmationSection event={event} onUpdate={handleUpdate} />
							)}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}

function EditPageSkeleton() {
	return (
		<div className="flex flex-col h-[calc(100vh-56px)]">
			<div className="h-14 border-b border-[var(--border)] flex items-center px-6 gap-4">
				<Skeleton className="h-7 w-16 rounded" />
				<Skeleton className="h-4 w-48 rounded" />
			</div>
			<div className="flex flex-1 overflow-hidden">
				<div className="w-[220px] border-r border-[var(--border)] p-4 space-y-2">
					{Array.from({ length: 7 }).map((_, i) => (
						<Skeleton
							key={i}
							className="h-9 w-full rounded-[var(--radius-sm)]"
						/>
					))}
				</div>
				<div className="flex-1 p-8 space-y-6">
					<Skeleton className="h-8 w-48 rounded" />
					<div className="space-y-4 max-w-[520px]">
						{Array.from({ length: 4 }).map((_, i) => (
							<Skeleton key={i} className="h-10 w-full rounded" />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
