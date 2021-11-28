import detector from "../tf";

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

onmessage = async function (e) {
  const people = await detector.estimatePoses(e.data.imageData);

  let leftWrist;
  let rightWrist;

  people.forEach((person) => {
    leftWrist = filterParts(person, "left_wrist");
    rightWrist = filterParts(person, "right_wrist");
  });

  postMessage({ leftWrist, rightWrist });
};
