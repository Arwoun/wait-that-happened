// Entry: renders the episode selected in src/episodes/current.ts as composition "Short" (1080x1920, 30 fps).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Short, FRAMES } from "./episodes/current";
const Root: React.FC = () => <Composition id="Short" component={Short} durationInFrames={FRAMES} fps={30} width={1080} height={1920} />;
registerRoot(Root);
