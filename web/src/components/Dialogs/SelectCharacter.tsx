import React from 'react';
import { Box, Text, Flex, Spacer, Button, ScaleFade } from '@chakra-ui/react';
import { theme } from '../../styles/theme';
import type { Character } from '../../types';
import { fetchNui } from '../../utils/fetchNui';

interface Props {
  visible: boolean;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
  character: Character;
}

const SelectCharacter: React.FC<Props> = (props) => {
  const playCharacter = () => {
    fetchNui('ox:newCharacter', props.character.slot);
    props.setVisible(false);
  };

  return (
    <ScaleFade in={props.visible} unmountOnExit>
      <Box
        w="100%"
        h="35vh"
        p={3}
        bg={theme.colors.sideHover}
        fontFamily="Poppins"
        visibility={props.visible ? 'visible' : 'hidden'}
      >
        <Flex justifyContent="center" alignItems="center" direction="column" h="100%">
          <Text fontSize="lg">{`${props.character.firstname} ${props.character.lastname}`}</Text>
          <Spacer />
          <Text>Gender</Text>
          <Text>{props.character.gender}</Text>
          <Spacer />
          <Text>Date of Birth</Text>
          <Text>{props.character.dateofbirth}</Text>
          <Spacer />
          <Text>Groups</Text>
          <Text>Ox, Police</Text>
          <Spacer />
          <Text>Phone Number</Text>
          <Text>069-357924</Text>
          <Spacer />
          <Box mb={1}>
            <Button mr={1} _hover={{ bg: 'green.500' }} onClick={() => playCharacter()}>
              Select
            </Button>
            <Button ml={1} _hover={{ bg: 'red.500' }} onClick={() => props.setVisible(false)}>
              Cancel
            </Button>
          </Box>
        </Flex>
      </Box>
    </ScaleFade>
  );
};

export default SelectCharacter;