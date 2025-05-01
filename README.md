# Réunion Metis 2021 Art Installation

![Alt text](/cover.jpg?raw=true "Preview of first scene of installation")
![output](https://github.com/jmorel88/reunion-metis-2021/assets/17187477/c5eb3c49-8eca-40fc-bb12-e1c85c40f228)

## Overview

This project is an interactive art installation created for the Réunion Metis 2021 Art Festival.

## How It Works

The installation uses a web cam to capture the movements of the users. The captured video is processed using TensorFlow.js to detect the positions of the users' hands. The detected positions are then used to control the animations and interactions in the artwork, which are rendered using Three.js and GSAP.

## Technologies Used

- TensorFlow.js
- Three.js
- GSAP
- Vite

## Installation

To set up the project locally, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/jmorel88/reunion-metis-2021.git
   cd reunion-metis-2021
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build the project for production:
   ```bash
   npm run build
   ```

5. Test the production build locally:
   ```bash
   npm run serve
   ```

## Requirements

- NPM

## Dependencies

- Tensorflow.js
- Three.js
- gsap

## Running the code

```bash
## install dependecies
npm install

## start development server
npm run dev

## build for production
npm run build

## test production build locally
npm run serve
```

## Collaboration

This project was created in collaboration with Lucie Degut. You can find her work on Instagram: [Lucie Degut](https://www.instagram.com/luciedegut/)
