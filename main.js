import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import Stats from "stats.js";
import gsap from "gsap";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

const testing = true;

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

  const raycaster = new THREE.Raycaster();

  /**
   * Stream camera to video
   */
  if (!testing) {
    const video = document.getElementById("video");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  }

  /**
   * WebGL
   */
  const canvas = document.getElementById("canvas");

  // renderer
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
  });
  renderer.setSize(viewport.width, viewport.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // scene
  const scene = new THREE.Scene();

  // camera
  const camera = new THREE.PerspectiveCamera(
    45,
    viewport.width / viewport.height,
    1,
    1000
  );

  camera.position.z = 5;

  function resize() {
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;

    renderer.setSize(viewport.width, viewport.height);

    camera.aspect = canvas.width / canvas.height;
    camera.updateProjectionMatrix();

    const fov = camera.fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * camera.position.z;
    const width = height * camera.aspect;

    clipspace.height = height;
    clipspace.width = width;
  }

  const resizer = new ResizeObserver(resize);
  resizer.observe(document.body);
  resize();

  // light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  // model loader
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");
  gltfLoader.setDRACOLoader(dracoLoader);

  // texture loader
  const textureLoader = new THREE.TextureLoader();

  function createTextureSets(flowerSourcesArray) {
    return flowerSourcesArray.map((flower) => {
      const texture = textureLoader.load(flower);
      texture.generateMipmaps = false;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      return texture;
    });
  }

  const flowerSetOneSources = [
    `/flower-3.png`,
    `/flower-4.png`,
    `/flower-5.png`,
  ];

  const flowerSetTwoSources = [
    `/flower-1.png`,
    `/flower-2.png`,
    `/flower-3.png`,
  ];

  const flowerSetOneTextures = createTextureSets(flowerSetOneSources);
  const flowerSetTwoTextures = createTextureSets(flowerSetTwoSources);

  const sets = [
    {
      building: "/building.gltf",
      textures: flowerSetOneTextures,
    },
    {
      building: "/building.gltf",
      textures: flowerSetTwoTextures,
    },
  ];

  let activeMeshes = [];
  let activeBuilding;
  let activeTextures;

  function selectSet(index = 0) {
    const set = sets[index];

    activeTextures = set.textures;

    gltfLoader.load(set.building, (gltf) => {
      activeBuilding = gltf.scene;
      activeBuilding.name = "building";
      activeBuilding.position.x = 2.25;
      activeBuilding.position.y = -0.75;
      scene.add(activeBuilding);
    });
  }

  selectSet();

  // gemetry
  const geometry = new THREE.PlaneGeometry(1, 1);

  // create mesh
  const createMesh = (texture) => {
    const material = new THREE.RawShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      vertexShader: `
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;

        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;

        void main() {
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          vUv = uv;
        }
      `,
      fragmentShader: `
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
        tMap: { value: texture },
        uAlpha: { value: 1.0 },
      },
    });

    return new THREE.Mesh(geometry, material);
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

    renderer.render(scene, camera);

    if (sceneIsChanging) {
      requestAnimationFrame(update);
      return;
    }

    if (testing) {
      setMeshPosition({
        x: mouse.x,
        y: mouse.y,
        id: 0,
        name: "mouse",
      });
    } else {
      const people = await detector.estimatePoses(video);

      people.forEach((person) => {
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
    if (mappedX > viewport.width || mappedY > viewport.height) return;
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

    const clipspaceX = posX - clipspace.width * 0.5;
    const clipspaceY = -1 * (posY - clipspace.height * 0.5);

    // check if on top of architecture
    let threshold = 100;
    let temporaryFlower = false;

    if (
      personIsOnArchitecture({
        x: (mappedX / viewport.width) * 2 - 1,
        y: -1 * ((mappedY / viewport.height) * 2 - 1),
      })
    ) {
      temporaryFlower = true;
    }

    // throttling

    // if the person is in throttle we return
    if (existingPerson.throttle) {
      return;
    }

    // else we set the throttle to true and pass in a threshold before next draw
    existingPerson.throttle = true;
    setTimeout(() => (existingPerson.throttle = false), threshold);

    // we also check if the person has not moved
    if (
      !testing &&
      ((existingPerson.lastPosition.x <= x + 3 &&
        existingPerson.lastPosition.x >= x - 3) ||
        (existingPerson.lastPosition.y <= y + 3 &&
          existingPerson.lastPosition.y >= y - 3))
    ) {
      return;
    }

    // else we set the lastPosition
    existingPerson.lastPosition = { x, y };

    // cache the data
    visiblePeople.push(existingPerson);

    // and finally addMeshToCanvas
    addMeshToCanvas(clipspaceX, clipspaceY, temporaryFlower);
  }

  function personIsOnArchitecture(personsPosition) {
    raycaster.setFromCamera(personsPosition, camera);

    if (!activeBuilding) return;

    const intersects = raycaster.intersectObject(activeBuilding);
    for (const intersect of intersects) {
      return intersect;
    }
  }

  function addMeshToCanvas(x, y, isTemporary) {
    // find a random flower material
    const flower =
      activeTextures[Math.floor(Math.random() * activeTextures.length)];

    // create the mesh and add it to the texture
    const mesh = createMesh(flower);
    activeMeshes.push(mesh);
    mesh.scale.set(0.0);
    scene.add(mesh);

    mesh.position.x = x;
    mesh.position.y = y;

    // entrance
    gsap.to(mesh.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 0.15 });

    // exit
    gsap.to(mesh.material.uniforms.uAlpha, {
      value: 0,
      ease: "Power3.easeIn",
      delay: isTemporary ? 1 : 15,
      onComplete: () => {
        mesh.material.dispose();
        scene.remove(mesh);
      },
    });
  }

  /* Change to new scene (new Architecture and flower set) */
  let sceneIsChanging = true;
  let activeScene = 0;

  function changeScene() {
    sceneIsChanging = true;
    gsap.to(canvas, {
      opacity: 0,
      onComplete: () => {
        activeMeshes.forEach((mesh) => {
          mesh.material.dispose();
          scene.remove(mesh);
        });
        scene.remove(activeBuilding);
        selectSet(activeScene);
        console.log(activeScene);
        activeScene = sets.length - 1 ? 0 : activeScene + 1;
        setTimeout(() => {
          gsap.to(canvas, {
            opacity: 1,
            onComplete: () => (sceneIsChanging = false),
          });
        }, 5000);
      },
    });
  }

  if (testing) {
    update();
    window.addEventListener("mousemove", (e) => {
      mouse.x = e?.clientX || 0;
      mouse.y = e?.clientY || 0;
    });
    changeScene();
    setInterval(changeScene, 1000 * 120);
  } else {
    update();
    //video.addEventListener("loadeddata", update);
  }

  window.scene = scene;
})();
