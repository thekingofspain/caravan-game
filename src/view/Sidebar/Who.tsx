import type { Nullable } from "../../model/types";

export const SIDE_ICON = { human: "👤", ai: "🤖" } as const;

export function Who({ side, caravan }: { side: "ai" | "human"; caravan?: Nullable<string> }) {
    return (
        <span className={`who ${side}`} aria-label={side === "ai" ? "AI" : "You"}>
            {caravan != null ? (
                <>
                    <span className="icon" aria-hidden="true">
                        {SIDE_ICON[side]}
                    </span>
                    <span className="caravan-ref" aria-hidden="true">
                        <span className="who-ref">{caravan}</span>
                    </span>
                </>
            ) : (
                <span aria-hidden="true">{SIDE_ICON[side]}</span>
            )}
        </span>
    );
}
