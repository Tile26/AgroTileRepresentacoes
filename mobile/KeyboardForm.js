import React, {createContext, useCallback, useContext, useEffect, useRef} from 'react';
import {Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput as NativeInput} from 'react-native';

const FocusContext = createContext(null);
export function KeyboardArea({children}) {
    return <FocusContext.Provider value={null}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{children}</KeyboardAvoidingView></FocusContext.Provider>;
}
export function KeyboardScrollView({children, contentContainerStyle, ...props}) {
    const scroll = useRef(null);
    const focused = useRef(null);
    const offset = useRef(0);
    const timer = useRef(null);
    const reveal = useCallback(() => {
        const input = focused.current;
        if (!input?.isFocused()) return;
        scroll.current?.measureInWindow((x, top, width, height) => {
            input.measureInWindow((ix, iy, iw, ih) => {
                if (!input.isFocused()) return;
                const bottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? Infinity) - 20;
                const delta = iy + ih > bottom ? iy + ih - bottom : iy < top + 20 ? iy - top - 20 : 0;
                if (delta) scroll.current?.scrollTo({y:Math.max(0, offset.current + delta), animated:true});
            });
        });
    }, []);
    const schedule = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(reveal, 120);
    }, [reveal]);
    const focus = useCallback(input => {focused.current = input; schedule();}, [schedule]);
    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', schedule);
        const frame = Keyboard.addListener('keyboardDidChangeFrame', schedule);
        return () => {show.remove(); frame.remove(); clearTimeout(timer.current);};
    }, [schedule]);
    return <KeyboardArea><FocusContext.Provider value={focus}>
        <ScrollView {...props} ref={scroll} keyboardShouldPersistTaps="handled" onLayout={schedule}
            onContentSizeChange={schedule} scrollEventThrottle={16}
            onScroll={event => {offset.current = event.nativeEvent.contentOffset.y;}}
            contentContainerStyle={[contentContainerStyle, {paddingBottom:100}]}>{children}</ScrollView>
    </FocusContext.Provider></KeyboardArea>;
}
export function KeyboardInput({onFocus, ...props}) {
    const input = useRef(null);
    const focus = useContext(FocusContext);
    return <NativeInput {...props} ref={input} onFocus={event => {focus?.(input.current); onFocus?.(event);}}/>;
}

