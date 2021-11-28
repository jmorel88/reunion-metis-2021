import Stats from "stats.js";

const worker = new Worker("./workers/tf.worker.js", {
  type: "module",
});

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
   * Stream camera to video and offload to canvas for webworker
   * there's no other way to pass the webcam data to the web worker
   */
  const video = document.getElementById("video");
  const webcam = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  video.srcObject = webcam;
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = 640;
  offscreenCanvas.height = 480;
  const offscreenCtx = offscreenCanvas.getContext("2d");

  const drawToOffscreen = function () {
    offscreenCtx.drawImage(video, 0, 0);
    const imageData = offscreenCtx.getImageData(0, 0, 640, 480);
    return imageData;
  };

  /**
   * Canvas
   */
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

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

    paintImageToCanvas(mappedX, mappedY, temporaryFlower);
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
   * Render
   */

  const render = async () => {
    stats.begin();
    const imageData = drawToOffscreen();
    worker.postMessage({ imageData });
    stats.end();
    requestAnimationFrame(render);
  };

  video.onloadeddata = render;

  worker.onmessage = (e) => {
    const { leftWrist, rightWrist } = e.data;
    leftWrist && positionImage(leftWrist);
    rightWrist && positionImage(rightWrist);
  };
})();
