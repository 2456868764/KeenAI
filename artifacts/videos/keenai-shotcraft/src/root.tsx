import React from 'react';
import { Composition } from 'remotion';
import { KeenAiShotcraft } from './KeenAiShotcraft';

export const Root: React.FC = () => (
  <Composition
    id="KeenAiShotcraft"
    component={KeenAiShotcraft}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={3600}
  />
);
