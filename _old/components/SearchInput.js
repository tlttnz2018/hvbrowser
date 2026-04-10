import React from 'react';
import { 
    StyleSheet, 
    TextInput,
    Text, 
    View,
    TouchableOpacity,
} from 'react-native';

var BGWASH = 'rgba(255,255,255,0.8)';
var DISABLED_WASH = 'rgba(255,255,255,0.25)';

export default class SearchInput extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            text: props.url,
            backButtonEnabled: false,
            backButtonHide: false,
        };
    }
    componentDidMount = () => {
        const {url,backButtonEnabled} = this.props;
        this.setState({backButtonEnabled});
        this.handleChangeText(url);
    }

    componentWillReceiveProps = (nextProps) => {
        const {url, backButtonEnabled} = nextProps;
        const {text} = this.state;
        this.setState({backButtonEnabled});

        if (url !== text) {
            this.handleChangeText(url);
        }
    }

    handleChangeText = (text) => {
        this.setState({text}); // Name to set must same as property declare.
    }

    handleSubmitEditing = () => {
        const {onSubmit} = this.props;
        const {text} = this.state;

        if (!text) return;

        onSubmit(text);
    }

    handleFocus = () => {
        const {onFocus} = this.props;
        onFocus(true);
        this.setState({
            backButtonHide: true,
        });
    }

    handleBlur = () => {
        const {onFocus} = this.props;
        onFocus(false);
        this.setState({
            backButtonHide: false,
        });
    }

    goBack = () => {
        const {onBack} = this.props;
        onBack();
    }

    render() {
        const {placeholder} = this.props;
        const {text, backButtonHide} = this.state;

        return (
            <View style={styles.container}>
                <TextInput
                    autoCorrect={false}
                    value={text}
                    placeholder={placeholder}
                    placeholderTextColor='white'
                    underlineColorAndroid='transparent'
                    style={styles.textInput}
                    clearButtonMode='always'
                    onChangeText={this.handleChangeText}
                    onSubmitEditing={this.handleSubmitEditing}
                    onFocus={this.handleFocus}
                    onBlur={this.handleBlur}
                    />
                {!backButtonHide && (<TouchableOpacity
                    onPress={this.goBack}
                    style={this.state.backButtonEnabled ? styles.navButton : styles.disabledButton}>
                    <Text>{'⇦'}</Text>
                </TouchableOpacity>)}
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        height: 30,
        flexDirection: 'row',
    },
    textInput: {
        flex: 1,
        color: 'white',
        backgroundColor: '#666',
        marginHorizontal: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
    },
    navButton: {
        width: 30,
        padding: 3,
        marginRight: 3,
        marginLeft: 3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BGWASH,
        borderColor: '#666',
        borderWidth: 1,
        borderRadius: 3,
    },
    disabledButton: {
        width: 30,
        padding: 3,
        marginRight: 3,
        marginLeft: 3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DISABLED_WASH,
        borderColor: '#000',
        borderWidth: 1,
        borderRadius: 3,
    },
});