import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";

/**
 * MoveNet
 */
const detectorConfig = {
  modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
  enableTracking: true,
  minPoseScore: 0.3,
};

const detector = await poseDetection.createDetector(
  poseDetection.SupportedModels.MoveNet,
  detectorConfig
);

export default detector;
