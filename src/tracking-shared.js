export function extractSignal(result) {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks || !result.faceBlendshapes?.[0]) return null;
  const values = Object.fromEntries(result.faceBlendshapes[0].categories.map(x => [x.categoryName, x.score]));
  return { smile: ((values.mouthSmileLeft || 0) + (values.mouthSmileRight || 0)) / 2,
    jaw: values.jawOpen || 0, points: [10, 152, 234, 454].map(i => ({ x: landmarks[i].x, y: landmarks[i].y })) };
}

export const trackerOptions = model => ({ baseOptions: { modelAssetPath: model, delegate: 'CPU' },
  runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
  minFaceDetectionConfidence: .55, minFacePresenceConfidence: .55, minTrackingConfidence: .5 });
