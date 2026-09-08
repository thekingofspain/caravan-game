import type { ReactNode } from "react";
import { memo } from "react";

import { caravanName } from "../../model/names";
import type { LogSegment } from "../../model/types";
import { Human } from "../../model/types";
import { CardName } from "./CardName";
import { Who } from "./Who";

function renderSegments(segments: LogSegment[], keyBase: string | number): ReactNode[] {
    const nodes: ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const key = `${String(keyBase)}-${String(i)}`;

        if (typeof segment === "string") {
            nodes.push(segment);
            continue;
        }

        if ("type" in segment) {
            if (segment.type === "actor") {
                nodes.push(<Who key={key} side={segment.player === Human ? "human" : "ai"} />);
                if (segment.form === "possessive") nodes.push("'s ");
            } else {
                nodes.push(caravanName(segment.player, segment.caravan));
            }

            continue;
        }

        nodes.push(<CardName key={key} card={segment} />);
    }

    return nodes;
}

export const DecoratedLog = memo(function DecoratedLog({
    text,
    segments,
    id
}: {
    text?: string;
    segments?: LogSegment[];
    id: string | number;
}) {
    if (segments !== undefined) {
        return <>{renderSegments(segments, id)}</>;
    }

    if (text !== undefined) {
        return <>{text}</>;
    }

    return null;
});

DecoratedLog.displayName = "DecoratedLog";
