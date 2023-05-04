/**
 * A VHS simulation where the user is able to pick their movie from a UI menu. Once selected, a user must click
 * the VHS tape inorder to activate the animation. In order for the movie to play, the user must click on the play button
 * on the VHS bar. Similarly, the pause button pauses the movie, and the eject button animates the VHS out of the VHS bar.
 * A movies progress will save when paused or ejected for access the next time that movie is selected. The movie's volume 
 * can be adjected with a slider on the bottom left of the screen. Audio is featured on button clicks whether or not the VHS is instered. 
 * Upon insetion/ejection of VHS tape, audio will play. 
 * 
 * @Authors Vito Leone
 */

'use strict';
// Allow use of glMatrix values directly instead of needing the glMatrix prefix
const mat4 = glMatrix.mat4;
 
// Global WebGL context variable
let gl;
 
let mv = mat4.create()

let modelTranslation = [[-.05,.1,-1], [-.05,-.18,-1], [-.29,-.13,-.45], [-.29,-.13,-.45]];

let modelRotation = [[0,0,0], [0,0,0], [-1.6, 0,0], [-1.6, 0,0]]

let scaleSizes = [[1,1,1], [1,.2,1], [.475,.1,.3], [.475,.1,.3]]

let transparencies = [1, 1, 1, 1]

let VHStimes = [0,0,0]

let textureNames = [
    'idle1.png', 'VHSbar.png', 'cowVHS.png', 'VHS.png',
    'idle1.png', 'idle2.png', 'idle3.png',
    'cowVHS.png', 'natureVHS.png', 'fightVHS.png']

let texturePromises = []
let textures = []

let tapeInserted = false;
let clicked = false;
let ejecting = false;
let removingCover = false;

let idleIndex = 4;
let VHStexOffset = 7;
let currVHS = 0;

let obj;
 
// Once the document is fully loaded run this init function.
window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }
 
    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }
 
    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height); // this is the region of the canvas we want to draw on (all of it)
    gl.enable(gl.DEPTH_TEST);
 
    // Initialize the WebGL program and data
    gl.program = initProgram();
     
    onWindowResize()
    createDOMelements();
    initEvents();

    initBuffers();
    initTextures();
    Promise.all(texturePromises).then(
        (tempTextures) => {
            textures.push(...tempTextures);
            render();
        }
    );

    window.setInterval(function () {
        idleIndex++;
        if (idleIndex > 6) {
            idleIndex = 4;
        }
        textures[0] = textures[idleIndex]
    }, 5000);
 
    gl.movieInput.disabled = false
 
});

/**
 * Setup the user-interaction events.
 */
function initEvents() {
    window.addEventListener('click', onClick);
    gl.movieInput.addEventListener('input', updateVHSTexture);
    gl.slider.addEventListener('change', setVolume)
}
 
/**
 * Initializes all html DOM elements that will be used in the file  
 */
function createDOMelements() {
    gl.movie = document.getElementById('movie');
    gl.movieInput = document.getElementById('texture')
    gl.clickAudio = document.getElementById('click');
    gl.VHSAudio = document.getElementById('VHS');
    gl.slider = document.getElementById('slider')
}

/**
 * Initialize the texture buffers.
 */
function initTextures() {
    for(let i = 0; i < 10; i++) {
        texturePromises.push(loadImageAsTexture(textureNames[i], i));
    }
}

/**
 * Load a texture onto the GPU.
 */
function loadTexture(img, index) {
    if (typeof index === 'undefined') { index = 0; }

    let texture = gl.createTexture(); // create a texture resource on the GPU
    gl.activeTexture(gl['TEXTURE' + index])
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

    gl.bindTexture(gl.TEXTURE_2D, null)

    return texture;
}

/**
 * Load an image file into a texture on the GPU. The second argument is the texture number,
 * defaulting to 0. Returns a Promise that resolves to the texture object.
 */
function loadImageAsTexture(img_url, index) {
    // Default argument value
    if (typeof index === 'undefined') { index = 0; }
    return new Promise(resolve => {
        // TODO: load the image and the texture, pass the resulting texture object to the resolve() function
        let image = new Image();
        image.src = img_url;
        image.addEventListener('load', () => {
            let texture = loadTexture(image, index);
            resolve(texture)
        });
    });
}
 
/**
  * Initializes the WebGL program.
  */
function initProgram() {
    // Compile shaders
    // Vertex Shader
    let vert_shader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform mat4 uModelViewMatrix;
        uniform mat4 uProjectionMatrix;

        const vec4 light = vec4(0.0, 1.0, -.0001, 1.0);

        in vec4 aPosition;
        in vec3 aNormal;
        
        in vec2 aTexCoord;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;
        
        out vec2 vTexCoord;

        flat out vec3 vColor;

        void main() {
            vec4 P = uModelViewMatrix * aPosition;

            gl_Position = uProjectionMatrix * P;

            vNormalVector = mat3(uModelViewMatrix) * aNormal;

            vLightVector = (P - light).xyz;
            
            vEyeVector = -P.xyz;

            vColor = vec3(0.85, 0.85, 0.85);

            vTexCoord = aTexCoord;
        }`
    );
    // Fragment Shader
    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        uniform float uTransparency;

        const vec3 lightColor = vec3(1.0, 1.0, 1.0);
        const float materialAmbient = 0.8;
        const float materialDiffuse = 0.4;
        const float materialSpecular = 0.6;
        const float materialShininess = 10.0;
        
        flat in vec3 vColor;

        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;

        uniform sampler2D uTexture;
        in vec2 vTexCoord;

        out vec4 fragColor;

        void main() {
            // Normalize vectors
            vec3 N = normalize(vNormalVector);
            vec3 E = normalize(vEyeVector);
            vec3 L = normalize(vLightVector);

            float diffuse = dot(-L, N);
            float specular = 0.0;
            if (diffuse < 0.0) {
                diffuse = 0.0;
            } else {
                vec3 R = reflect(L, N);
                specular = pow(max(dot(R, E), 0.0), materialShininess);
            }

            vec4 color = texture(uTexture, vTexCoord);

            fragColor.rgb = lightColor * (
                (materialAmbient + materialDiffuse * diffuse) * color.rgb +
                materialSpecular * specular);
            fragColor.a = uTransparency;
        }`
    );
 
    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
     
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition');
    program.aNormal = gl.getAttribLocation(program, 'aNormal');
    program.aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
 
    // Get the uniform indices
    program.uModelViewMatrix = gl.getUniformLocation(program, 'uModelViewMatrix');
    program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    program.uTransparency = gl.getUniformLocation(program, 'uTransparency');
    program.uTexture = gl.getUniformLocation(program, 'uTexture');
 
    return program;
}
 
/**
* Initialize the data buffers.
*/
function initBuffers() {
 
    gl.coords = Float32Array.from([
        .5, .9, .5,    // A
        -.5, .9, .5,   // B
        -.5, -.1, .5,  // C
        .5, -.1, .5,   // D
        .5, -.1, -.5,  // E
        -.5, -.1, -.5, // F
        -.5, .9, -.5,  // G
        .5, .9, -.5,   // H
    ]);
    let tex_coords = [
        1, 1, // A
        0, 1, // B
        0, 0, // C
        1, 0, // D
        1, 1, // E
        0, 1, // F
        0, 0, // G
        1, 0, // H
    ];
    gl.indices = [
        1, 2, 0, 2, 3, 0,
        7, 6, 1, 0, 7, 1,
        1, 6, 2, 6, 5, 2,
        3, 2, 4, 2, 5, 4,
        6, 7, 5, 7, 4, 5,
        0, 3, 7, 3, 4, 7,
    ];
 
    obj = createObject(gl.coords, tex_coords, gl.indices, true);
}

/**
 * Creates a VAO containing the coordinates, colors, and indices provided
 */
function createObject(coords, tex_coords, indices, is_tri_strip) {
    coords = Float32Array.from(coords);
    tex_coords = Float32Array.from(tex_coords);
    let normals = coords;

    // Create and bind VAO
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Load the coordinate data into the GPU and associate with shader
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aPosition);

    // Load the normal data into the GPU and associate with shader
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aNormal);
    
    //Load the texture coordinate data into the GPU and associate with shader
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, tex_coords, gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aTexCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aTexCoord);

    // Load the index data into the GPU
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(indices), gl.STATIC_DRAW);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // Return the object information
    return [vao, indices.length, is_tri_strip ? gl.TRIANGLE_STRIP : gl.TRIANGLES];
}

/**
 * Calls transformation functions for both the VHS cover and VHS tape. Those functions only called based on index
 * @param {*} index index that the render for loop is currentlty in
 */
function transformVHS(index) {
    
    if(!tapeInserted && clicked && index === 2) {
        removingCover = true
        moveVHSCover(true)
    } else if (!tapeInserted && index === 2 && !ejecting) {
        removingCover = true
        moveVHSCover(false)
    }

    if(!tapeInserted && clicked && index === 3 && !removingCover) {
        updateVHSTransforms(true)
    } else if(tapeInserted && clicked && index === 3 && !removingCover) {
        updateVHSTransforms(false)
    } 
   
    if((!tapeInserted && index === 0) || ejecting) {
        transparencies[0] = 1;
    } else if(tapeInserted && index === 0 && gl.VHSAudio.paused) {
        transparencies[0] = 0;
    } 

    uploadTransformations(index)
}

/**
 * Moves the VHS cover off/onto the VHS beased on boolean parameter removing
 * @param {*} removing true if cover is being removed, false if cover is being put on
 */
function moveVHSCover(removing) {
    let inc = -.005;
    let compare = modelTranslation[2][0] > -.8;
    let transform = [modelTranslation[2]]
    
    if(!removing) {
        inc *= -1
        compare = modelTranslation[2][0] < -.29;
    }
    
    if(compare) {
        transform[0][0] += inc
    } else {
        removingCover = false;
    }
}

/**
 * Updates the transformation values for the VHS tape animation.
 * Plays the audio for the vhs tape while instering.
 * Updates boolean values based on whether or not the tape is inseted in the VHS bar
 * @param {*} inserting true if VHS is being inserted, false if it removed
 */
function updateVHSTransforms(inserting) {
    let inc = .015;
    let compare = [modelRotation[3][0]<0,modelTranslation[3][2] < 1.2]
    let transform = [modelRotation[3], modelTranslation[3]]
    let firstIndex = 0;
    let secondIndex = 2;
    
    if(!inserting) {
        inc *= -1
        firstIndex = 2
        secondIndex = 0;

        compare = [modelTranslation[3][2] > -.45, modelRotation[3][0] > -1.6]
        transform = [modelTranslation[3], modelRotation[3]]
    }
    
    if(compare[0]) {
        transform[0][firstIndex] += inc
    } else if (compare[1]) {
        transform[1][secondIndex] += inc
        if(inserting) {
            gl.VHSAudio.play()
        }
    } else{
        tapeInserted = inserting;
        removingCover = !inserting
        clicked = false;
        ejecting = false;
    }
}

/**
 * Resets, transforms and uploads the model view matrix and uploads
 * @param {*} index index of shape which will be tansformed
 */
function uploadTransformations(index) {
    mv = mat4.create()
    mat4.rotateX(mv, mv, modelRotation[index][0])
    mat4.rotateY(mv, mv, modelRotation[index][1])
    mat4.translate(mv, mv, modelTranslation[index]);
     
    mat4.scale(mv, mv, scaleSizes[index]);

    gl.uniformMatrix4fv(gl.program.uModelViewMatrix, false, mv);
    
    gl.uniform1f(gl.program.uTransparency, transparencies[index]);
    gl.uniform1i(gl.program.uTexture, index)
}

/**
 * Render the scene. Must be called once and only once. It will call itself again.
 */
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.movieInput.disabled = clicked || tapeInserted || removingCover

    for(let i = 0; i < 4; i++) {
        let [vao, count, mode] = obj;

        gl.activeTexture(gl['TEXTURE' + i])
        gl.bindTexture(gl.TEXTURE_2D, textures[i]);

        gl.bindVertexArray(vao);
        transformVHS(i);
        gl.drawElements(mode, count, gl.UNSIGNED_SHORT, 0);
        
        gl.bindTexture(gl.TEXTURE_2D, null)
        gl.bindVertexArray(null);
    }
    window.requestAnimationFrame(render);
}

/**
  * Gets the click coordinates and if the click is on:
  * 1) The VHS - the VHS will animate into the VHS player
  * 2) The play button - if the VHS is inserted and video is paused, the video plays
  * 3) The pause button - if the VHS is inserted and video is playing, the video pauses
  * 4) The eject button - if the VHS is inserted, the video pauses and VHS ejects
  */
function onClick(e) {
    e.preventDefault();
    e.preventDefault();
    let [x, y, w, h] = [e.offsetX, e.offsetY, gl.canvas.offsetWidth, gl.canvas.offsetHeight];

    x = ((2/w)*x) - 1;
    y = -((2/h)*y) +1;

    let VHSclicked = x > -.525 && x < -.05 && y > -.6 && y < -.3;
    let ejectClicked = x > .3125 && x < .44 && y > -.2 && y < 0;
    let playButtonClicked = x > .0125 && x < .135 && y > -.2 && y < 0;
    let pauseButtonClicked = x > .16 && x < .2825 && y > -.2 && y < 0;


    if(tapeInserted) {
        VHSbar(false, ejectClicked, playButtonClicked, pauseButtonClicked)
    } else if (VHSclicked) {
        VHSbar(VHSclicked, false, false, false)
    } else if (ejectClicked || playButtonClicked || pauseButtonClicked) {
        gl.clickAudio.play()
    }
    

}

function VHSbar(VHSclicked, ejectClicked, playButtonClicked, pauseButtonClicked) {
    if(VHSclicked) {
        clicked = true;
    } else if (ejectClicked) {
        ejecting = true;  
        clicked = true;
        saveVHStime()
        gl.VHSAudio.play()
    } else if (playButtonClicked) {
        gl.movie.currentTime = VHStimes[currVHS]
        gl.movie.play() 
        gl.clickAudio.play()
    } else if(pauseButtonClicked) {
        saveVHStime()
    }
}

/**
 * Saves the current time of the VHS for a start up of that time later.
 * Pauses the movie and plays the click audio
 */
function saveVHStime() {
    VHStimes[currVHS] = gl.movie.currentTime
    gl.movie.pause() 
    gl.clickAudio.play()
}

/**
 * Changes the texture of the VHS cover based on the input menu
 * Saves current time of ejcting movie so it can be resarted upon its next selection
 */
function updateVHSTexture() {
    if(!tapeInserted) {
        currVHS = 0
        if(gl.movieInput.value === 'rapids') {
            currVHS = 1;
        } else if(gl.movieInput.value === 'fight') {
            currVHS = 2;
        }
        
        textures[2] = textures[currVHS + VHStexOffset]

        gl.movie.setAttribute('src',  gl.movieInput.value + ".mp4");

        gl.movie.currentTime = VHStimes[currVHS]
    }
}

/**
 * Sets the volume for the movie based on slider value
 */
function setVolume() {
    gl.movie.volume = gl.slider.value
}
 
/**
  * Keep the canvas sized to the window.
  */
function onWindowResize() {
    let [w, h] = [window.innerWidth, window.innerHeight];
    gl.canvas.width = w;
    gl.canvas.height = h;
    gl.viewport(0, 0, w, h);
    updateProjectionMatrix();
}
 
/**
  * Updates the projection transformation matrix.
  */
function updateProjectionMatrix() {
    let p = mat4.ortho(mat4.create(), -1, 1, -1, 1, -1, .65);
    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, p);
}