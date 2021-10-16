import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import Stats from "stats.js";
import gsap from "gsap";
import {
  Renderer,
  Plane,
  Program,
  Mesh,
  Texture,
  Camera,
  Transform,
} from "ogl";

const testing = false;

const stats = new Stats();
stats.showPanel(0);
//document.body.appendChild(stats.dom);

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

  const clipspace = {
    width: 0,
    height: 0,
  };

  const mouse = {
    id: 0,
    x: 0,
    y: 0,
  };

  function VisiblePerson(id) {
    this.id = id;
    this.throttling = false;
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
   * WebGL
   */
  const canvas = document.getElementById("canvas");

  // renderer
  const renderer = new Renderer({
    canvas: canvas,
    width: viewport.width,
    height: viewport.height,
  });

  const gl = renderer.gl;

  // camera
  const camera = new Camera(gl);
  camera.fov = 45;
  camera.position.z = 5;

  // scene
  const scene = new Transform();

  // resize
  function resize() {
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;

    renderer.setSize(viewport.width, viewport.height);

    camera.perspective({
      aspect: gl.canvas.width / gl.canvas.height,
    });

    const fov = camera.fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * camera.position.z;
    const width = height * camera.aspect;

    clipspace.height = height;
    clipspace.width = width;
  }

  const resizer = new ResizeObserver(resize);
  resizer.observe(document.body);
  resize();

  // gemetry
  const geometry = new Plane(gl, {
    width: 0.5,
    height: 0.5,
  });

  // textures
  const flowerTextures = flowers.map((flower) => {
    const texture = new Texture(gl, {
      generateMipmaps: false,
    });

    texture.image = flower;

    return texture;
  });

  // create a mesh
  const createMesh = (flower) => {
    const program = new Program(gl, {
      cullFace: null,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      vertex: `
        attribute vec2 uv;
        attribute vec3 position;

        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;

        varying vec2 vUv;

        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vUv = uv;
        }
      `,
      fragment: `
          precision highp float;
  
          uniform sampler2D tMap;
          uniform float uAlpha;

          varying vec2 vUv;
  
          void main() {
            vec4 tex2d = texture2D(tMap, vUv);
            if (tex2d.a < 0.1) discard;
            gl_FragColor = vec4(tex2d.rgb, uAlpha);
          }
      `,
      uniforms: {
        tMap: { value: flower },
        uAlpha: { value: 1.0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    return { mesh, program };
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

  async function update(t = 0) {
    stats.begin();

    renderer.render({ scene, camera });

    if (!testing) {
      const people = await detector.estimatePoses(video);

      people.forEach((person, index) => {
        // const nose = filterParts(person, "nose");
        // nose && addMeshToCanvas(nose);

        const leftWrist = filterParts(person, "left_wrist");
        leftWrist && setMeshPosition(leftWrist);

        const rightWrist = filterParts(person, "right_wrist");
        rightWrist && setMeshPosition(rightWrist);
      });
    }

    stats.end();

    requestAnimationFrame(update);
  }

  function setMeshPosition({ x, y, id, name }) {
    const mappedX = mapRange(x, 0, 640, 0, viewport.width);
    const mappedY = mapRange(y, 0, 480, 0, viewport.height);
    const posX = (mappedX / viewport.width) * clipspace.width;
    const posY = (mappedY / viewport.height) * clipspace.height;

    // check for existing person
    let existingPerson = visiblePeople.find(
      (person) => person.id === name + id
    );

    // if no exisiting person we create one
    if (!existingPerson) {
      existingPerson = new VisiblePerson(name + id);
    }

    /** THROTTLING ON HOLD **************************** 
    // if the person is in throttle we return
    if (existingPerson.throttle) {
      return;
    }

    // else we set the throttle to true and give it 50ms threshold
    existingPerson.throttle = true;
    setTimeout(() => (existingPerson.throttle = false), 15);
    
    THROTTLING ON HOLD ********************************/
    // we also check if the person has not moved
    if (
      (existingPerson.lastPosition.x <= x + 3 &&
        existingPerson.lastPosition.x >= x - 3) ||
      (existingPerson.lastPosition.y <= y + 3 &&
        existingPerson.lastPosition.y >= y - 3)
    ) {
      return;
    }

    // else we set the lastPosition
    existingPerson.lastPosition = { x, y };

    // cache the data
    visiblePeople.push(existingPerson);

    // and finally addMeshToCanvas
    addMeshToCanvas(posX, posY);
  }

  function addMeshToCanvas(x, y) {
    // find a random flower
    const flower =
      flowerTextures[Math.floor(Math.random() * flowerTextures.length)];

    // create the mesh and add it to the texture
    const { mesh, program } = createMesh(flower);
    mesh.scale.set(0.0);
    mesh.setParent(scene);
    mesh.position.x = x - clipspace.width * 0.5;
    mesh.position.y = -1 * (y - clipspace.height * 0.5);

    // entrance and exit
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.15 });
    gsap.to(program.uniforms.uAlpha, {
      value: 0,
      ease: "Power3.easeIn",
      delay: 3,
      onComplete: () => {
        scene.removeChild(mesh);
      },
    });
  }

  if (testing) {
    update();
    window.addEventListener("mousemove", (e) => {
      mouse.x = (e?.clientX / viewport.width) * clipspace.width;
      mouse.y = (e?.clientY / viewport.height) * clipspace.height;
      addMeshToCanvas(mouse);
    });
  } else {
    video.addEventListener("loadeddata", update);
  }
})();
