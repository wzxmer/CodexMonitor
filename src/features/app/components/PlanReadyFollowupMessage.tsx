import { useMemo, useState } from "react";

type PlanReadyFollowupMessageProps = {
  onAccept: () => void;
  onSubmitChanges: (changes: string) => void;
};

export function PlanReadyFollowupMessage({
  onAccept,
  onSubmitChanges,
}: PlanReadyFollowupMessageProps) {
  const [changes, setChanges] = useState("");
  const trimmed = useMemo(() => changes.trim(), [changes]);

  return (
    <div className="message request-user-input-message">
      <div
        className="bubble request-user-input-card"
        role="group"
        aria-label="计划已就绪"
      >
        <div className="request-user-input-header">
          <div className="request-user-input-title">计划已就绪</div>
        </div>
        <div className="request-user-input-body">
          <section className="request-user-input-question">
            <div className="request-user-input-question-text">
              按这个计划开始实现，或描述你想修改的内容。
            </div>
            <textarea
              className="request-user-input-notes"
              placeholder="描述你想修改计划中的哪些内容..."
              value={changes}
              onChange={(event) => setChanges(event.target.value)}
              rows={3}
            />
          </section>
        </div>
        <div className="request-user-input-actions">
          <button
            type="button"
            className="plan-ready-followup-change"
            onClick={() => {
              if (!trimmed) {
                return;
              }
              onSubmitChanges(trimmed);
              setChanges("");
            }}
            disabled={!trimmed}
          >
            发送修改意见
          </button>
          <button type="button" className="primary" onClick={onAccept}>
            执行这个计划
          </button>
        </div>
      </div>
    </div>
  );
}
