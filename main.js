import Installation from "./src/index";

window.addEventListener("load", async () => {
  const reunionMetis = new Installation();
  await reunionMetis.init();
});
