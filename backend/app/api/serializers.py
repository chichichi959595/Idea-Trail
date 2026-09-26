from __future__ import annotations

from app.db.models import Idea, IdeationSession, MethodRecommendation, MethodRun, MethodStep


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
        "status": run.status,
        "current_step_index": run.current_step_index,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
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
        "created_at": idea.created_at.isoformat(),
    }
