import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import Stats from "stats.js";

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

(async () => {
  /**
   * Cache
   */
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  const aspectRatio = viewport.width / viewport.height;

  /**
   * Stream camera to video
   */
  const video = document.getElementById("video");
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;

  /**
   * Canvas
   */
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = 640 * dpr;
  canvas.height = 480 * dpr;
  ctx.scale(dpr, dpr);
  /**
   * Resize
   */
  const resizer = new ResizeObserver(() => {
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;
    console.log("resized.");
  });

  resizer.observe(canvas);

  /**
   * load flower images
   */
  const images = [
    `/textures/flower-1.png`,
    `/textures/flower-2.png`,
    `/textures/flower-3.png`,
    `/textures/flower-4.png`,
    `/textures/flower-5.png`,
  ];

  const loadImage = (src) => {
    return new Promise((resolve) => {
      const image = new Image();
      image.width = 50;
      image.height = 50;
      image.onload = () => resolve(image);
      image.src = src;
    });
  };

  const loadImages = async (arrayOfImages) => {
    const unresolvedImages = arrayOfImages.map(loadImage);
    return await Promise.all(unresolvedImages);
  };

  const flowers = await loadImages(images);

  /**
   * Paint Flowers
   */
  const appendImageToCanvas = (image, x, y) => {
    const data = {
      x: x - image.width * 0.5,
      y: y - image.height * 0.5,
      width: image.width,
      height: image.height,
    };

    ctx.drawImage(image, data.x, data.y, data.width, data.height);
  };

  const paintImages = ({ x, y }) => {
    const image = flowers[Math.floor(Math.random() * flowers.length)];
    appendImageToCanvas(image, x, y);
  };

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

  /**
   * Render
   */
  const filterParts = (person, part) => {
    return person.keypoints.find((point) => point.name === part);
  };

  const render = async () => {
    stats.begin();

    const people = await detector.estimatePoses(video);

    people.forEach((person, index) => {
      // const nose = filterParts(person, "nose");
      // nose && paintImages(nose);

      const leftWrist = filterParts(person, "left_wrist");
      leftWrist && paintImages(leftWrist);

      const rightWrist = filterParts(person, "right_wrist");
      rightWrist && paintImages(rightWrist);
    });

    stats.end();

    requestAnimationFrame(render);
  };

  video.addEventListener("loadeddata", render);

  /**
   * Testing
   */
  const pause = document.getElementById("pause");

  pause.addEventListener("click", () => {
    ctx.clearRect(0, 0, viewport.width, viewport.height);
  });

  // const mouse = {
  //   x: 0,
  //   y: 0,
  // };

  // window.addEventListener("mousemove", (e) => {
  //   mouse.x = e?.clientX;
  //   mouse.y = e?.clientY;
  //   console.log(mouse);
  //   paintImages(mouse);
  // });
})();
