from __future__ import annotations

from app.db.models import (
    ConvergenceProject,
    Idea,
    IdeationSession,
    MethodRecommendation,
    MethodRun,
    MethodStep,
    PainPoint,
)


def session_to_dict(s: IdeationSession) -> dict:
    return {
        "id": s.id,
        "team_size": s.team_size,
        "time_budget": s.time_budget,
        "tech_background": s.tech_background,
        "domain_pref": s.domain_pref,
        "constraints_text": s.constraints_text,
        "has_clear_problem": s.has_clear_problem,
        "clear_problem_text": s.clear_problem_text,
        "has_existing_product": s.has_existing_product,
        "existing_product_text": s.existing_product_text,
        "created_at": s.created_at.isoformat(),
    }


def recommendation_to_dict(r: MethodRecommendation) -> dict:
    return {
        "id": r.id,
        "method": r.method,
        "rank": r.rank,
        "rationale": r.rationale,
    }


def step_to_dict(s: MethodStep) -> dict:
    return {
        "id": s.id,
        "step_index": s.step_index,
        "step_name": s.step_name,
        "question_shown": s.question_shown,
        "timer_seconds": s.timer_seconds,
        "user_answer": s.user_answer,
        "agent_output": s.agent_output_json,
        "created_at": s.created_at.isoformat(),
    }


def method_run_to_dict(run: MethodRun, *, include_steps: bool = True) -> dict:
    data = {
        "id": run.id,
        "session_id": run.session_id,
        "method_name": run.method_name,
        "provider": run.provider,
        "model": run.model,
        "step_model": run.step_model,
        "status": run.status,
        "current_step_index": run.current_step_index,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "mode": run.mode or "solo",
        "join_code": run.join_code,
        # A relay's length depends on how many people showed up, so the
        # catalog's step count isn't it. None until the run starts.
        "relay_rounds": len(run.relay_rungs) if run.relay_rungs else None,
        "pain_point_id": run.pain_point_id,
    }
    if include_steps:
        data["steps"] = [step_to_dict(s) for s in run.steps]
    return data


def idea_to_dict(idea: Idea) -> dict:
    return {
        "id": idea.id,
        "session_id": idea.session_id,
        "method_run_id": idea.method_run_id,
        "title": idea.title,
        "description": idea.description,
        "source_method": idea.source_method,
        "is_synthesized": idea.is_synthesized,
        "parent_idea_ids": idea.parent_idea_ids,
        "pain_point_id": idea.pain_point_id,
        "size": idea.size,
        "created_at": idea.created_at.isoformat(),
    }


def pain_point_to_dict(p: PainPoint, *, idea_count: int | None = None) -> dict:
    data = {
        "id": p.id,
        "session_id": p.session_id,
        "statement": p.statement,
        "who": p.who,
        "context": p.context,
        "current_workaround": p.current_workaround,
        "source": p.source,
        "method_run_id": p.method_run_id,
        "created_at": p.created_at.isoformat(),
    }
    if idea_count is not None:
        data["idea_count"] = idea_count
    return data


def convergence_project_to_dict(p: ConvergenceProject) -> dict:
    return {
        "id": p.id,
        "idea_id": p.idea_id,
        "session_id": p.session_id,
        "debate": p.debate or [],
        "demand_verdict": p.demand_verdict,
        "demand_notes": p.demand_notes,
        "features": p.features or [],
        "research": p.research,
        "feasibility": p.feasibility,
        "decision": p.decision,
        "decision_notes": p.decision_notes,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }
