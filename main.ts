//% color="#31C7D5" weight=10 icon="\uf1d0"
namespace robotbit {
    const PCA9685_ADDRESS = 0x40
    const MODE1 = 0x00
    const MODE2 = 0x01
    const SUBADR1 = 0x02
    const SUBADR2 = 0x03
    const SUBADR3 = 0x04
    const PRESCALE = 0xFE
    const LED0_ON_L = 0x06
    const LED0_ON_H = 0x07
    const LED0_OFF_L = 0x08
    const LED0_OFF_H = 0x09
    const ALL_LED_ON_L = 0xFA
    const ALL_LED_ON_H = 0xFB
    const ALL_LED_OFF_L = 0xFC
    const ALL_LED_OFF_H = 0xFD

    const STP_CHA_L = 2047
    const STP_CHA_H = 4095
    const STP_CHB_L = 1
    const STP_CHB_H = 2047
    const STP_CHC_L = 1023
    const STP_CHC_H = 3071
    const STP_CHD_L = 3071
    const STP_CHD_H = 1023

    const RGB_PIN = DigitalPin.P16

    export enum Servos {
        S1 = 0x01,
        S2 = 0x02,
        S3 = 0x03,
        S4 = 0x04,
        S5 = 0x05,
        S6 = 0x06,
        S7 = 0x07,
        S8 = 0x08
    }

    export enum Motors {
        M1A = 0x1,
        M1B = 0x2,
        M2A = 0x3,
        M2B = 0x4
    }

    export enum Steppers {
        M1 = 0x1,
        M2 = 0x2
    }

    export enum Turns {
        //% blockId="T1B4" block="1/4"
        T1B4 = 90,
        //% blockId="T1B2" block="1/2"
        T1B2 = 180,
        //% blockId="T1B0" block="1"
        T1B0 = 360,
        //% blockId="T2B0" block="2"
        T2B0 = 720,
        //% blockId="T3B0" block="3"
        T3B0 = 1080,
        //% blockId="T4B0" block="4"
        T4B0 = 1440,
        //% blockId="T5B0" block="5"
        T5B0 = 1800
    }

    let initialized = false
    let rgb_initialized = false
    let rgb_buffer: Buffer = null;

    function i2cwrite(addr: number, reg: number, value: number) {
        let buf = pins.createBuffer(2)
        buf[0] = reg
        buf[1] = value
        pins.i2cWriteBuffer(addr, buf)
    }

    function i2cread(addr: number, reg: number) {
        pins.i2cWriteNumber(addr, reg, NumberFormat.UInt8BE);
        let val = pins.i2cReadNumber(addr, NumberFormat.UInt8BE);
        return val;
    }

    function initPCA9685(): void {
        i2cwrite(PCA9685_ADDRESS, MODE1, 0x00)
        setFreq(50);
        for (let idx = 0; idx < 16; idx++) {
            setPwm(idx, 0, 0);
        }
        initialized = true
    }

    function setFreq(freq: number): void {
        // Constrain the frequency
        let prescaleval = 25000000;
        prescaleval /= 4096;
        prescaleval /= freq;
        prescaleval -= 1;
        let prescale = prescaleval; //Math.Floor(prescaleval + 0.5);
        let oldmode = i2cread(PCA9685_ADDRESS, MODE1);
        let newmode = (oldmode & 0x7F) | 0x10; // sleep
        i2cwrite(PCA9685_ADDRESS, MODE1, newmode); // go to sleep
        i2cwrite(PCA9685_ADDRESS, PRESCALE, prescale); // set the prescaler
        i2cwrite(PCA9685_ADDRESS, MODE1, oldmode);
        control.waitMicros(5000);
        i2cwrite(PCA9685_ADDRESS, MODE1, oldmode | 0xa1);
    }

    function setPwm(channel: number, on: number, off: number): void {
        if (channel < 0 || channel > 15)
            return;

        let buf = pins.createBuffer(5);
        buf[0] = LED0_ON_L + 4 * channel;
        buf[1] = on & 0xff;
        buf[2] = (on >> 8) & 0xff;
        buf[3] = off & 0xff;
        buf[4] = (off >> 8) & 0xff;
        pins.i2cWriteBuffer(PCA9685_ADDRESS, buf);
    }

    function setStepper(index: number, dir: boolean): void {
        if (index == 1) {
            if (dir) {
                setPwm(0, STP_CHA_L, STP_CHA_H);
                setPwm(2, STP_CHB_L, STP_CHB_H);
                setPwm(1, STP_CHC_L, STP_CHC_H);
                setPwm(3, STP_CHD_L, STP_CHD_H);
            } else {
                setPwm(3, STP_CHA_L, STP_CHA_H);
                setPwm(1, STP_CHB_L, STP_CHB_H);
                setPwm(2, STP_CHC_L, STP_CHC_H);
                setPwm(0, STP_CHD_L, STP_CHD_H);
            }
        } else {
            if (dir) {
                setPwm(4, STP_CHA_L, STP_CHA_H);
                setPwm(6, STP_CHB_L, STP_CHB_H);
                setPwm(5, STP_CHC_L, STP_CHC_H);
                setPwm(7, STP_CHD_L, STP_CHD_H);
            } else {
                setPwm(7, STP_CHA_L, STP_CHA_H);
                setPwm(5, STP_CHB_L, STP_CHB_H);
                setPwm(6, STP_CHC_L, STP_CHC_H);
                setPwm(4, STP_CHD_L, STP_CHD_H);
            }
        }
    }

    function stopMotor(index: number) {
        setPwm((index - 1) * 2, 0, 0);
        setPwm((index - 1) * 2 + 1, 0, 0);
    }

    function rgbInit(): void {
        rgb_initialized = true;
        rgb_buffer = pins.createBuffer(4 * 3); // 4 pixels, 3 bytes each
        pins.digitalWritePin(RGB_PIN, 0);
    }

    function rgbSetBuffer(pixel: number, red: number, green: number, blue: number, brightness: number = 255): void {
        if (pixel < 0 || pixel >= 4)
            return;
        const offset = pixel * 3;
        
        if (brightness < 255) {
            red = (red * brightness) >> 8;
            green = (green * brightness) >> 8;
            blue = (blue * brightness) >> 8;
        }
        
        rgb_buffer[offset + 0] = green;
        rgb_buffer[offset + 1] = red;
        rgb_buffer[offset + 2] = blue;
    }

    function rgbShowBuffer(): void {
        ws2812b.sendBuffer(rgb_buffer, RGB_PIN);
    }

    function rgbUnpackR(rgb: number): number {
        let r = (rgb >> 16) & 0xFF;
        return r;
    }

    function rgbUnpackG(rgb: number): number {
        let g = (rgb >> 8) & 0xFF;
        return g;
    }

    function rgbUnpackB(rgb: number): number {
        let b = (rgb) & 0xFF;
        return b;
    }

    //% blockId=robotbit_rgb_set_all block="RGB set all to %color||brightness %brightness|show %show" group="RGB" weight=75
    //% color.shadow="colorNumberPicker"
    //% brightness.min=0 brightness.max=255 brightness.defl=255
    //% show.defl=true
    //% expandableArgumentMode="toggle"
    /**
     * Set all four RGB pixels to the same color.
     * @param color color value in 0xRRGGBB
     * @param brightness overall brightness 0-255
     * @param show whether to write the buffer to the LEDs immediately
     */
    export function RgbSetColorAll(color: number, brightness: number = 255, show: boolean = true): void {
        if (!rgb_initialized) {
            rgbInit();
        }
        for (let i = 0; i < 4; i++) {
            rgbSetBuffer(i, rgbUnpackR(color), rgbUnpackG(color), rgbUnpackB(color), brightness);
        }
        if (show) {
            rgbShowBuffer();
        }
    }

    //% blockId=robotbit_rgb_set_all_rgb block="RGB set all to R %red G %green B %blue||brightness %brightness|show %show" group="RGB" weight=74
    //% red.min=0 red.max=255 red.defl=255
    //% green.min=0 green.max=255 green.defl=255
    //% blue.min=0 blue.max=255 blue.defl=255
    //% brightness.min=0 brightness.max=255 brightness.defl=255
    //% show.defl=true
    //% expandableArgumentMode="toggle"
    //% advanced=true
    /**
     * Set all four RGB pixels using separate red, green, blue values.
     * @param red red intensity 0-255
     * @param green green intensity 0-255
     * @param blue blue intensity 0-255
     * @param brightness overall brightness 0-255
     * @param show whether to write the buffer to the LEDs immediately
     */
    export function RgbSetColorAllRGB(red: number, green: number, blue: number, brightness: number = 255, show: boolean = true): void {
        if (!rgb_initialized) {
            rgbInit();
        }
        for (let i = 0; i < 4; i++) {
            rgbSetBuffer(i, red, green, blue, brightness);
        }
        if (show) {
            rgbShowBuffer();
        }
    }

    //% blockId=robotbit_rgb_set_one block="RGB set pixel %index to %color||brightness %brightness|show %show" group="RGB" weight=74
    //% color.shadow="colorNumberPicker"
    //% brightness.min=0 brightness.max=255 brightness.defl=255
    //% show.defl=true
    //% expandableArgumentMode="toggle"
    //% index.min=0 index.max=3
    /**
     * Set a single RGB pixel to a specific color.
     * @param index pixel index from 0 to 3
     * @param color color value in 0xRRGGBB
     * @param brightness overall brightness 0-255
     * @param show whether to write the buffer to the LEDs immediately
     */
    export function RgbSetColor(index: number, color: number, brightness: number = 255, show: boolean = true): void {
        if (!rgb_initialized) {
            rgbInit();
        }
        rgbSetBuffer(index, rgbUnpackR(color), rgbUnpackG(color), rgbUnpackB(color), brightness);
        if (show) {
            rgbShowBuffer();
        }
    }

    //% blockId=robotbit_rgb_set_one_rgb block="RGB set pixel %index to R %red G %green B %blue||brightness %brightness|show %show" group="RGB" weight=73
    //% index.min=0 index.max=3
    //% red.min=0 red.max=255 red.defl=255
    //% green.min=0 green.max=255 green.defl=255
    //% blue.min=0 blue.max=255 blue.defl=255
    //% brightness.min=0 brightness.max=255 brightness.defl=255
    //% show.defl=true
    //% expandableArgumentMode="toggle"
    //% advanced=true
    /**
     * Set a single RGB pixel using separate red, green, blue values.
     * @param index pixel index from 0 to 3
     * @param red red intensity 0-255
     * @param green green intensity 0-255
     * @param blue blue intensity 0-255
     * @param brightness overall brightness 0-255
     * @param show whether to write the buffer to the LEDs immediately
     */
    export function RgbSetColorRGB(index: number, red: number, green: number, blue: number, brightness: number = 255, show: boolean = true): void {
        if (!rgb_initialized) {
            rgbInit();
        }
        rgbSetBuffer(index, red, green, blue, brightness);
        if (show) {
            rgbShowBuffer();
        }
    }

    //% blockId=robotbit_rgb_clear block="RGB clear||show %show" group="RGB" weight=73
    //% show.defl=true
    //% expandableArgumentMode="toggle"
    /**
     * Clear all RGB pixels to off.
     * @param show whether to write the buffer to the LEDs immediately
     */
    export function RgbClear(show: boolean = true): void {
        if (!rgb_initialized) {
            rgbInit();
        }
        for (let i = 0; i < 4; i++) {
            rgbSetBuffer(i, 0, 0, 0);
        }
        if (show) {
            rgbShowBuffer();
        }
    }

    //% blockId=robotbit_rgb_show block="RGB show" group="RGB" weight=72
    //% advanced=true
    /**
     * Flush the RGB buffer to the LEDs.
     */
    export function RgbShow(): void {
        if (!rgb_initialized) {
            rgbInit();
        }
        rgbShowBuffer();
    }

    /**
     * Servo Execute
     * @param index Servo Channel; eg: S1
     * @param degree [0-180] degree of servo; eg: 0, 90, 180
    */
    //% blockId=robotbit_servo block="Servo|%index|degree %degree"
    //% group="Servo" weight=62
    //% degree.min=0 degree.max=180
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    export function Servo(index: Servos, degree: number): void {
        if (!initialized) {
            initPCA9685()
        }
        // 50hz: 20,000 us
        let v_us = (degree * 1800 / 180 + 600) // 0.6 ~ 2.4
        let value = v_us * 4096 / 20000
        setPwm(index + 7, 0, value)
    }

    /**
     * Geek Servo
     * @param index Servo Channel; eg: S1
     * @param degree [-45-225] degree of servo; eg: -45, 90, 225
    */
    //% blockId=robotbit_gservo block="Geek Servo|%index|degree %degree"
    ///% group="Servo" weight=61
    //% degree.min=-45 degree.max=225
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    //% advanced=true
    export function GeekServo(index: Servos, degree: number): void {
        if (!initialized) {
            initPCA9685()
        }
        // 50hz: 20,000 us
        let v_us = ((degree - 90) * 20 / 3 + 1500) // 0.6 ~ 2.4
        let value = v_us * 4096 / 20000
        setPwm(index + 7, 0, value)
    }

    /**
     * GeekServo2KG
     * @param index Servo Channel; eg: S1
     * @param degree [0-360] degree of servo; eg: 0, 180, 360
    */
    //% blockId=robotbit_gservo2kg block="GeekServo2KG|%index|degree %degree"
    //% group="Servo" weight=60
    //% blockGap=50
    //% degree.min=0 degree.max=360
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    //% advanced=true
    export function GeekServo2KG(index: Servos, degree: number): void {
        if (!initialized) {
            initPCA9685()
        }
        // 50hz: 20,000 us
        //let v_us = (degree * 2000 / 360 + 500)  0.5 ~ 2.5
        let v_us = (Math.floor((degree) * 2000 / 350) + 500) //fixed
        let value = v_us * 4096 / 20000
        setPwm(index + 7, 0, value)
    }
	
    /**
     * GeekServo5KG
     * @param index Servo Channel; eg: S1
     * @param degree [0-360] degree of servo; eg: 0, 180, 360
    */
    //% blockId=robotbit_gservo5kg block="GeekServo5KG|%index|degree %degree"
    //% group="Servo" weight=59
    //% degree.min=0 degree.max=360
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    //% advanced=true
    /**
     * Control a GeekServo5KG from 0 to 360 degrees.
     * @param index servo channel
     * @param degree target angle between 0 and 360
     */
    export function GeekServo5KG(index: Servos, degree: number): void {
        if (!initialized) {
            initPCA9685()
        }
        const minInput = 0;
        const maxInput = 355;//理论值为360
        const minOutput = 500;
        const maxOutput = 2500;
        const v_us = ((degree - minInput) / (maxInput - minInput)) * (maxOutput - minOutput) + minOutput;

        let value = v_us * 4096 / 20000
        setPwm(index + 7, 0, value)
    }

    //% blockId=robotbit_gservo5kg_motor block="GeekServo5KG_MotorEN|%index|speed %speed"
    //% group="Servo" weight=58
    //% speed.min=-255 speed.max=255
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    //% advanced=true
    /**
     * Drive a GeekServo5KG motor channel at a speed from -255 to 255.
     * @param index servo channel
     * @param speed motor speed from -255 (full reverse) to 255 (full forward)
     */
    export function GeekServo5KG_Motor(index: Servos, speed: number): void {
        if (!initialized) {
            initPCA9685();
        }
        setPwm(index + 7, 0, Math.round(((speed + 255) / 510 * 2000 + 3200) * 4096 / 20000))
    }
    
    //% blockId=robotbit_stepper_degree block="Stepper 28BYJ-48|%index|degree %degree"
    //% group="Motor" weight=54
    //% advanced=true
    /**
     * Turn one stepper by degrees.
     * @param index stepper motor index
     * @param degree positive for forward, negative for reverse
     */
    export function StepperDegree(index: Steppers, degree: number): void {
        if (!initialized) {
            initPCA9685()
        }
        setStepper(index, degree > 0);
        degree = Math.abs(degree);
        basic.pause(10240 * degree / 360);
        MotorStopAll()
    }

    //% blockId=robotbit_stepper_turn block="Stepper 28BYJ-48|%index|turn %turn"
    //% group="Motor" weight=53
    //% advanced=true
    /**
     * Turn one stepper by preset turns.
     * @param index stepper motor index
     * @param turn preset turn selection
     */
    export function StepperTurn(index: Steppers, turn: Turns): void {
        let degree = turn;
        StepperDegree(index, degree);
    }

    //% blockId=robotbit_stepper_dual block="Dual Stepper(Degree) |M1 %degree1| M2 %degree2"
    //% group="Motor" weight=52
    //% advanced=true
    /**
     * Turn both steppers by degrees at once.
     * @param degree1 degrees for stepper M1
     * @param degree2 degrees for stepper M2
     */
    export function StepperDual(degree1: number, degree2: number): void {
        if (!initialized) {
            initPCA9685()
        }
        setStepper(1, degree1 > 0);
        setStepper(2, degree2 > 0);
        degree1 = Math.abs(degree1);
        degree2 = Math.abs(degree2);
        basic.pause(10240 * Math.min(degree1, degree2) / 360);
        if (degree1 > degree2) {
            stopMotor(3); stopMotor(4);
            basic.pause(10240 * (degree1 - degree2) / 360);
        } else {
            stopMotor(1); stopMotor(2);
            basic.pause(10240 * (degree2 - degree1) / 360);
        }

        MotorStopAll()
    }

    /**
     * Stepper Car move forward
     * @param distance Distance to move in cm; eg: 10, 20
     * @param diameter diameter of wheel in mm; eg: 48
    */
    //% blockId=robotbit_stpcar_move block="Car Forward|Distance(cm) %distance|Wheel Diameter(mm) %diameter"
    //% group="Motor" weight=51
    //% advanced=true
    export function StpCarMove(distance: number, diameter: number): void {
        if (!initialized) {
            initPCA9685()
        }
        let delay = 10240 * 10 * distance / 3 / diameter; // use 3 instead of pi
        setStepper(1, delay > 0);
        setStepper(2, delay > 0);
        delay = Math.abs(delay);
        basic.pause(delay);
        MotorStopAll()
    }

    /**
     * Stepper Car turn by degree
     * @param turn Degree to turn; eg: 90, 180, 360
     * @param diameter diameter of wheel in mm; eg: 48
     * @param track track width of car; eg: 125
    */
    //% blockId=robotbit_stpcar_turn block="Car Turn|Degree %turn|Wheel Diameter(mm) %diameter|Track(mm) %track"
    //% group="Motor" weight=50
    //% blockGap=50
    //% advanced=true
    export function StpCarTurn(turn: number, diameter: number, track: number): void {
        if (!initialized) {
            initPCA9685()
        }
        let delay = 10240 * turn * track / 360 / diameter;
        setStepper(1, delay < 0);
        setStepper(2, delay > 0);
        delay = Math.abs(delay);
        basic.pause(delay);
        MotorStopAll()
    }

    //% blockId=robotbit_motor_run block="Motor|%index|speed %speed"
    //% group="Motor" weight=59
    //% speed.min=-255 speed.max=255
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    /**
     * Run one motor channel at the given speed.
     * @param index motor channel
     * @param speed motor speed from -255 (reverse) to 255 (forward)
     */
    export function MotorRun(index: Motors, speed: number): void {
        if (!initialized) {
            initPCA9685()
        }
        speed = speed * 16; // map 255 to 4096
        if (speed >= 4096) {
            speed = 4095
        }
        if (speed <= -4096) {
            speed = -4095
        }
        if (index > 4 || index <= 0)
            return
        let pp = (index - 1) * 2
        let pn = (index - 1) * 2 + 1
        if (speed >= 0) {
            setPwm(pp, 0, speed)
            setPwm(pn, 0, 0)
        } else {
            setPwm(pp, 0, 0)
            setPwm(pn, 0, -speed)
        }
    }

    /**
     * Execute two motors at the same time
     * @param motor1 First Motor; eg: M1A, M1B
     * @param speed1 [-255-255] speed of motor; eg: 150, -150
     * @param motor2 Second Motor; eg: M2A, M2B
     * @param speed2 [-255-255] speed of motor; eg: 150, -150
    */
    //% blockId=robotbit_motor_dual block="Motor|%motor1|speed %speed1|%motor2|speed %speed2"
    //% group="Motor" weight=58
    //% speed1.min=-255 speed1.max=255
    //% speed2.min=-255 speed2.max=255
    //% name.fieldEditor="gridpicker" name.fieldOptions.columns=4
    /**
     * Run two motor channels simultaneously with independent speeds.
     * @param motor1 first motor channel
     * @param speed1 speed for first motor (-255 to 255)
     * @param motor2 second motor channel
     * @param speed2 speed for second motor (-255 to 255)
     */
    export function MotorRunDual(motor1: Motors, speed1: number, motor2: Motors, speed2: number): void {
        MotorRun(motor1, speed1);
        MotorRun(motor2, speed2);
    }

    //% blockId=robotbit_stop block="Motor Stop|%index|"
    //% group="Motor" weight=56
    /**
     * Stop a single motor channel.
     * @param index motor channel to stop
     */
    export function MotorStop(index: Motors): void {
        MotorRun(index, 0);
    }

    //% blockId=robotbit_stop_all block="Motor Stop All"
    //% group="Motor" weight=55
    //% blockGap=50
    /**
     * Stop all motor channels.
     */
    export function MotorStopAll(): void {
        if (!initialized) {
            initPCA9685()
        }
        for (let idx = 1; idx <= 4; idx++) {
            stopMotor(idx);
        }
    }
}