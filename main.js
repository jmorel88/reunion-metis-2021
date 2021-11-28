import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import Stats from "stats.js";

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const mapRange = (value, inMin, inMax, outMin, outMax) => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};

(async () => {
  /**
   * Cache
   */
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  /**
   * New Person in screen
   */
  function VisiblePerson(id) {
    this.id = id;
    this.throttle = false;
    this.lastPosition = { x: 0, y: 0 };
  }

  const visiblePeople = [];

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
  canvas.width = viewport.width * dpr;
  canvas.height = viewport.height * dpr;
  ctx.scale(dpr, dpr);
  /**
   * Resize
   */
  const resizer = new ResizeObserver(() => {
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
  });

  resizer.observe(canvas);

  /**
   * load flower images
   */
  const images = [
    `/flower-1.png`,
    `/flower-2.png`,
    `/flower-3.png`,
    `/flower-4.png`,
    `/flower-5.png`,
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
  function personIsOnArchitecture(personsPosition) {
    // write a funtion that test if the user is on top of a building
    // document.elementFromPoint(x, y) should return svg if inside
    // maybe a different solution since this can cause frame drops.
    // hopefully not serious since my dom is only a few elements
    // returns true or false
  }

  const positionImage = ({ x, y, id, name }) => {
    const mappedX = mapRange(x, 0, 640, 0, viewport.width);
    const mappedY = mapRange(y, 0, 480, 0, viewport.height);

    if (mappedX > viewport.width || mappedY > viewport.height) return;

    // check for existing person
    let existingPerson = visiblePeople.find(
      (person) => person.id === name + id
    );

    // if no exisiting person we create one
    if (!existingPerson) {
      existingPerson = new VisiblePerson(name + id);
    }

    // check if person is on top of architecture
    let temporaryFlower = false;

    if (personIsOnArchitecture({ x: mappedX, y: mappedY })) {
      temporaryFlower = true;
    }

    // if the person is in throttle we return
    if (existingPerson.throttle) {
      return;
    }

    // else we set the throttle to true and pass in a threshold before next draw
    let threshold = 100;
    existingPerson.throttle = true;
    setTimeout(() => (existingPerson.throttle = false), threshold);

    // we also check if the person has not moved
    if (
      (existingPerson.lastPosition.x <= x + 5 &&
        existingPerson.lastPosition.x >= x - 5) ||
      (existingPerson.lastPosition.y <= y + 5 &&
        existingPerson.lastPosition.y >= y - 5)
    ) {
      return;
    }

    // else we set the lastPosition
    existingPerson.lastPosition = { x, y };

    // cache the data
    visiblePeople.push(existingPerson);

    paintImageToCanvas(x, y, temporaryFlower);
  };

  const paintImageToCanvas = (x, y, isTemp) => {
    const image = flowers[Math.floor(Math.random() * flowers.length)];

    const data = {
      x: x - image.width * 0.5,
      y: y - image.height * 0.5,
      width: image.width,
      height: image.height,
      scale: 0,
      opacity: 1,
    };

    ctx.drawImage(image, data.x, data.y, data.width, data.height);
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
    const points = person.keypoints.find((point) => point.name === part);

    if (!points) return;

    return {
      x: points.x,
      y: points.y,
      id: person.id,
      name: points.name,
    };
  };

  const render = async () => {
    stats.begin();

    // if (sceneIsChanging) {
    //   requestAnimationFrame(update);
    //   return;
    // }

    const people = await detector.estimatePoses(video);

    people.forEach((person, index) => {
      const leftWrist = filterParts(person, "left_wrist");
      leftWrist && positionImage(leftWrist);

      const rightWrist = filterParts(person, "right_wrist");
      rightWrist && positionImage(rightWrist);
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
  //   positionImage(mouse);
  // });
})();
